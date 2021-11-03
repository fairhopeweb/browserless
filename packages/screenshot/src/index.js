'use strict'

const { PuppeteerPendingRequests } = require('@agabhane/puppeteer-pending-requests')
const debug = require('debug-logfmt')('browserless:screenshot')
const createGoto = require('@browserless/goto')
const prettyMs = require('pretty-ms')
const timeSpan = require('time-span')
const pReflect = require('p-reflect')

const isWhiteScreenshot = require('./is-white-screenshot')
const waitForPrism = require('./pretty')
const overlay = require('./overlay')

const getBoundingClientRect = element => {
  const { top, left, height, width, x, y } = element.getBoundingClientRect()
  return { top, left, height, width, x, y }
}

/* eslint-disable */
const waitForImagesOnViewport = page =>
  page.$$eval('img[src]:not([aria-hidden="true"])', elements =>
    Promise.all(
      elements
        .filter(el => el.getBoundingClientRect().top <= window.innerHeight)
        .map(el => el.decode())
    )
  )
/* eslint-enable */

const waitForElement = async (page, element) => {
  const screenshotOpts = {}

  if (element) {
    await page.waitForSelector(element, { visible: true })
    screenshotOpts.clip = await page.$eval(element, getBoundingClientRect)
    screenshotOpts.fullPage = false
    return screenshotOpts
  }

  return screenshotOpts
}

module.exports = ({ goto, ...gotoOpts }) => {
  goto = goto || createGoto(gotoOpts)

  return page => async (
    url,
    {
      element,
      codeScheme = 'atom-dark',
      overlay: overlayOpts = {},
      waitUntil = 'auto',
      ...opts
    } = {}
  ) => {
    let screenshot
    let response

    const beforeScreenshot = response =>
      Promise.all(
        [
          { fn: () => page.evaluate('document.fonts.ready'), debug: 'beforeScreenshot:fontsReady' },
          {
            fn: () => waitForPrism(page, response, { codeScheme, ...opts }),
            debug: 'beforeScreenshot:waitForPrism'
          },
          {
            fn: () => waitForImagesOnViewport(page),
            debug: 'beforeScreenshot:waitForImagesOnViewport'
          }
        ].map(({ fn, ...opts }) => goto.run({ fn: fn(), timeout: goto.actionTimeout, ...opts }))
      )

    const takeScreenshot = async opts => {
      screenshot = await page.screenshot(opts)
      const isWhite = await isWhiteScreenshot(screenshot)
      if (isWhite) {
        await goto.waitUntilAuto(page, opts)
        screenshot = await page.screenshot(opts)
      }
      return { isWhite }
    }

    page.on('dialog', dialog => pReflect(dialog.dismiss()))

    const timeScreenshot = timeSpan()

    if (waitUntil !== 'auto') {
      ;({ response } = await goto(page, { ...opts, url, waitUntil }))
      const [screenshotOpts] = await Promise.all([
        waitForElement(page, element),
        beforeScreenshot(response)
      ])
      screenshot = await page.screenshot({ ...opts, ...screenshotOpts })
      debug('screenshot', { waitUntil, duration: prettyMs(timeScreenshot()) })
    } else {
      const puppeteerPendingRequests = new PuppeteerPendingRequests(page)
      ;({ response } = await goto(page, { ...opts, url, waitUntilAuto }))
      async function waitUntilAuto (page, { response }) {
        const [screenshotOpts] = await Promise.all([
          waitForElement(page, element),
          beforeScreenshot(response),
          puppeteerPendingRequests.waitForNetworkIdle(100)
        ])
        const { isWhite } = await takeScreenshot({ ...opts, ...screenshotOpts })
        debug('screenshot', { waitUntil, isWhite, duration: prettyMs(timeScreenshot()) })
      }
    }

    return Object.keys(overlayOpts).length === 0
      ? screenshot
      : overlay(screenshot, { ...opts, ...overlayOpts, viewport: page.viewport() })
  }
}

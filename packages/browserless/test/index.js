'use strict'

const test = require('ava')
const createBrowserless = require('../src')

require('@browserless/test')(createBrowserless())
;['pdf', 'screenshot', 'html', 'text'].forEach(method => {
  test.skip(`.${method} wrap errors`, async t => {
    const timeout = 50

    const browserlessFactory = createBrowserless({ timeout })
    const browserless = await browserlessFactory.createContext()

    const error = await t.throwsAsync(
      browserless[method]('https://example.com', { adblock: false, animations: true })
    )

    await browserless.destroyContext()

    t.is(error.name, 'BrowserlessError')
    t.is(error.code, 'EBRWSRTIMEOUT')
    t.is(error.message, `EBRWSRTIMEOUT, Promise timed out after ${timeout} milliseconds`)

    const browser = await browserless.browser()
    const pages = await browser.pages()

    t.is(pages.length, 1) // about:page is always open

    await browserless.destroyContext()
    await browserlessFactory.close()
  })
})

test('ensure to destroy browser contexts', async t => {
  const browserlessFactory = createBrowserless()
  const browser = await browserlessFactory.browser()

  t.is(browser.browserContexts().length, 1)

  const browserless = await browserlessFactory.createContext()

  await browserless.context()

  t.is(browser.browserContexts().length, 2)

  await browserless.destroyContext()

  t.is(browser.browserContexts().length, 1)

  await browser.close()
})

import { Actor } from 'apify'
import { Dataset, PlaywrightCrawler } from 'crawlee'

await Actor.init()

const proxyConfiguration = await Actor.createProxyConfiguration()

const crawler = new PlaywrightCrawler({
  proxyConfiguration,
  requestHandler: async ({ request, page, log }) => {
    const title = await page.title()
    log.info(`${title}`, { url: request.loadedUrl })

    const features = await page.$$('div[class="padding-horiz--md padding-bottom--md"]')

    await Promise.all(
      features.map(async (element) => {
        const title = await element.$eval('h3', (el) => el.textContent)
        const description = await element.$eval('p', (el) => el.textContent)
        log.info(`${title}: ${description}`)
        await Dataset.pushData({
          title,
          description,
        })
      })
    )
  },
})

await crawler.run(['https://crawlee.dev'])

await Actor.exit()

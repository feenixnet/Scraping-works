import { Actor } from 'apify'
import { CheerioCrawler, Dataset } from 'crawlee'

await Actor.init()

const proxyConfiguration = await Actor.createProxyConfiguration()

const crawler = new CheerioCrawler({
  proxyConfiguration,
  requestHandler: async ({ request, $, log }) => {
    const title = $('title').text()
    log.info(`${title}`, { url: request.loadedUrl })

    const features = $('div[class="padding-horiz--md padding-bottom--md"]')

    await Promise.all(
      features.toArray().map(async (element) => {
        const title = $(element).find('h3').text()
        const description = $(element).find('p').text()
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

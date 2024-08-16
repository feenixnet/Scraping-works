import { Actor } from 'apify'
import { CheerioCrawler, Dataset } from 'crawlee'

await Actor.init()

const proxyConfiguration = await Actor.createProxyConfiguration()

const crawler = new CheerioCrawler({
  proxyConfiguration,
  requestHandler: async ({ request, $ }) => {
    const url = request.url

    try {
      console.log(`Fetching data from: ${url}`)

      // Extract data for each wine estate
      const rows = $('tr').toArray()

      for (const row of rows) {
        const columns = $(row).find('td').toArray()

        if (columns.length > 0) {
          const wineEstate = $(columns[1]).text().trim()
          const town = $(columns[2]).text().trim()
          const province = $(columns[3]).text().trim()
          const region = $(columns[4]).text().trim()
          const country = $(columns[5]).text().trim()
          const certificationBody = $(columns[6]).text().trim()

          const data = {
            wineEstate,
            town,
            province,
            region,
            country,
            certificationBody,
          }

          console.log(data)
          await Dataset.pushData(data)
        }
      }
    } catch (error) {
      console.error(`Error handling request ${url}:`, error)
    }
  },
})

await crawler.run(['https://www.equalitas.it/en/equalitas-sustainable-wineries/'])

await Actor.exit()

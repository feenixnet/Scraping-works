import { Actor } from 'apify'
import { CheerioCrawler, Dataset, RequestQueue } from 'crawlee'

await Actor.init()

const requestQueue = await RequestQueue.open()

// List of main URLs to scrape
const baseUrls = [
  'https://topworkplaces.com/award/top-workplaces-usa/2024/2500-plus/',
  'https://topworkplaces.com/award/top-workplaces-usa/2024/1000-2499/',
  'https://topworkplaces.com/award/top-workplaces-usa/2024/500-999/',
  'https://topworkplaces.com/award/top-workplaces-usa/2024/150-499/',
]

// Enqueue the first page for each main URL
for (const url of baseUrls) {
  const companySize = url.split('/').slice(-2, -1)[0] // Extract company size from URL
  await requestQueue.addRequest({ url, userData: { companySize } })
}

const crawler = new CheerioCrawler({
  requestQueue,
  requestHandler: async ({ request, $, log }) => {
    const { isProfilePage, rank, name, headquarters, companySize } = request.userData

    // Handle profile pages
    if (isProfilePage) {
      console.log('Profile detail page got.')
      const industry = $('h2:contains("Industry")').next('div').text().trim()
      log.info(`Industry for ${name}: ${industry}`)

      // Save the combined data
      await Dataset.pushData({
        'Company size': companySize,
        'Award year': '2024',
        Rank: rank,
        Name: name,
        Headquarters: headquarters,
        Industry: industry,
        'Profile url': request.url,
      })

      return // Exit the handler for profile pages
    }

    // Handle main pages
    const companyEntries = $('div.py-8')

    await Promise.all(
      companyEntries.toArray().map(async (element) => {
        const rankMatch = $(element)
          .find('h2.text-xl a')
          .text()
          .match(/^(\d+)\./)

        const rank = rankMatch ? rankMatch[1] : '' // Safely handle null values
        const name = $(element)
          .find('h2.text-xl a')
          .text()
          .replace(/^\d+\.\s*/, '')
        const href = $(element).find('h2.text-xl a').attr('href')

        let profileUrl: string | undefined
        if (href) {
          profileUrl = new URL(href, request.loadedUrl).href
        } else {
          log.warning(`Profile URL is missing for element: ${$(element).html()}`)
        }

        const headquarters = $(element).find('p.text-xs.leading-6').eq(2).text()

        if (profileUrl) {
          log.info(
            `Rank: ${rank}, Name: ${name}, Profile URL: ${profileUrl}, Headquarters: ${headquarters}`
          )

          // Enqueue the profile URL for further processing
          await requestQueue.addRequest({
            url: profileUrl,
            userData: {
              rank,
              name,
              headquarters,
              isProfilePage: true, // Flag to identify the profile page
              companySize: request.userData.companySize, // Pass company size
            },
          })
        }
      })
    )

    // Extract the last page number
    const lastPageLink = $('a.pagination__page-value').last().attr('href')
    const lastPageNumberMatch = lastPageLink?.match(/page=(\d+)$/)
    const lastPageNumber = lastPageNumberMatch ? parseInt(lastPageNumberMatch[1], 10) : 1

    // Enqueue pages from the current page to the last page
    const currentPageNumberMatch = request.url.match(/page=(\d+)$/)
    const currentPageNumber = currentPageNumberMatch ? parseInt(currentPageNumberMatch[1], 10) : 1

    // Construct URL for each subsequent page
    for (let page = currentPageNumber + 1; page <= lastPageNumber; page++) {
      const nextPageUrl = `${request.loadedUrl.split('?')[0]}?page=${page}`
      log.info(`Enqueueing next page: ${nextPageUrl}`)
      await requestQueue.addRequest({ url: nextPageUrl })
    }
  },
})

// Run the crawler
await crawler.run()

await Actor.exit()

import { Actor } from 'apify'
import { CheerioCrawler, Dataset } from 'crawlee'

// Initialize Apify Actor
await Actor.init()

// Create a new CheerioCrawler instance with custom request handling logic
const crawler = new CheerioCrawler({
  requestHandlerTimeoutSecs: 30, // Set a timeout for request handling
  maxRequestsPerCrawl: 10000, // Limit requests for testing
  requestHandler: async ({ request, $, crawler }) => {
    const url = request.url
    try {
      if (request.userData.label === 'MAIN_PAGE') {
        // Extract links from the main directory page
        /* eslint-disable  @typescript-eslint/no-explicit-any */
        const itemLinks: string[] = []
        $('h3.color--primary--purple.size__width--75 a').each((_, element: any) => {
          let link: string | undefined = $(element).attr('href')
          if (link) {
            // Ensure URLs are absolute
            if (!link.startsWith('http')) {
              link = `https://www.seia.org${link}`
            }
            itemLinks.push(link)
          }
        })

        // Enqueue the links for detailed scraping
        await crawler.addRequests(
          itemLinks.map((link) => ({ url: link, userData: { label: 'DETAIL_PAGE' } }))
        )

        // Find the active pagination item
        const activePaginationItem = $('li.pager__item.is-active')
        // Find the next pagination item
        const nextPaginationItem = activePaginationItem.next('li.pager__item')

        if (nextPaginationItem.length > 0) {
          const nextPaginationLink = nextPaginationItem.find('a').attr('href')
          if (nextPaginationLink) {
            const nextPageUrl = nextPaginationLink.startsWith('http')
              ? nextPaginationLink
              : `https://www.seia.org/directory${nextPaginationLink}`
            console.log(`Enqueuing next page: ${nextPageUrl}`)
            // Enqueue the next page link
            await crawler.addRequests([{ url: nextPageUrl, userData: { label: 'MAIN_PAGE' } }])
          } else {
            console.log('No href found in the next pagination item.')
          }
        } else {
          console.log('No more pagination items.')
        }
      } else if (request.userData.label === 'DETAIL_PAGE') {
        // Detailed page logic
        console.log('Processing detailed page:', url)

        const data = {
          companyName: '',
          description: '',
          businessType: '',
          address: '',
          website: '',
        }

        // Adjust these selectors based on the actual structure of the detailed page
        data.companyName = $('h2.page-title span').text().trim()
        data.description = $('div.content-article p').first().text().trim().replace(/\n+/g, ' ')
        data.businessType = $('div.field.field_business_type').text().trim()

        const streetAddress = $('div.field.field_address div.field-item').text().trim()
        const city = $('div.field.field_city').text().trim()
        const state = $('div.field.field_physical_state').text().trim()

        data.address = `${streetAddress}${city ? `, ${city}` : ''}${state ? ` ${state}` : ''}`

        data.website = $(
          'div.color--primary--purple.copy--18.field-body.field.field_website div.field-item a'
        )
          .text()
          ?.trim()

        // Log or store the extracted data
        console.log(data)
        await Dataset.pushData(data)
      }
    } catch (error) {
      console.error(`Error handling request ${url}:`, error)
    }
  },
})

// Start the crawler with the initial main page URL
await crawler.run([{ url: 'https://www.seia.org/directory', userData: { label: 'MAIN_PAGE' } }])

await Actor.exit() // Exit the Apify Actor

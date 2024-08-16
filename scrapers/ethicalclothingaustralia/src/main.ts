import { Actor } from 'apify'
import { CheerioCrawler, Dataset, RequestQueue } from 'crawlee'

await Actor.init()

// Create a request queue
const requestQueue = await RequestQueue.open()

// Initial URL to enqueue
await requestQueue.addRequest({
  url: 'https://ethicalclothingaustralia.org.au/wp-admin/admin-ajax.php?action=getMarkers&map_id=359',
  uniqueKey: 'init',
})

// CheerioCrawler Configuration
const crawler = new CheerioCrawler({
  requestQueue,
  requestHandler: async ({ request, $, log, json }) => {
    if (request.uniqueKey === 'init') {
      const manufacturers = json.data

      for (const manufacturer of manufacturers) {
        const detailPageUrl = manufacturer[13]
        const logoUrl = manufacturer[15]

        const formattedLogoUrl = logoUrl.replace(/<img.*?src=["'](.*?)["'].*?>/, '$1')
        const cleanedLogoUrl = formattedLogoUrl.replace(/&amp;/g, '&').replace(/\\/g, '/')

        log.info(`Enqueuing ${manufacturer[1]} for scraping`, { url: detailPageUrl })

        await requestQueue.addRequest({
          url: detailPageUrl,
          uniqueKey: manufacturer[0], // Use unique ID for deduplication
          userData: {
            name: manufacturer[1],
            LogoUrl: cleanedLogoUrl,
          },
        })
      }
    } else {
      // Scrape the detail page
      const { userData } = request

      const Name = userData.name
      console.log('Name: ', Name)

      const LogoURL = userData.LogoUrl

      const descriptionParagraphs = $('h2').closest('.wpb_text_column').parent().find('p')
      let Description = ''
      descriptionParagraphs.each((_, element) => {
        const paragraphText = $(element).text().trim()
        Description += `${paragraphText}`
      })
      console.log('Description', Description)

      const contactHeader = $('.iwt-text h4:contains("Contact")')
      let Contact = ''
      contactHeader
        .closest('.iwithtext')
        .nextAll('p')
        .find('a')
        .each((_, element) => {
          const contactText = $(element).text().trim()
          Contact += contactText + '; '
        })

      Contact = Contact.trim().replace(/;$/, '')
      console.log('Contact:', Contact)

      const followOnSocialHeader = $('.iwt-text h4:contains("Follow On Social")')
      let FollowOnSocial = ''
      followOnSocialHeader
        .closest('.iwithtext')
        .next('p')
        .find('a')
        .each((_, element) => {
          const followOnSocialText = $(element).text().trim()
          FollowOnSocial += followOnSocialText + '; '
        })
      console.log('Follow On Social: ', FollowOnSocial)

      const amountMadeInAustralia = $('strong:contains("Amount Made In Australia")')
      const AmountMadeInAustralia = amountMadeInAustralia
        .closest('.iwithtext')
        .next('p')
        .text()
        .trim()
      console.log('Amount Made In Australia: ', AmountMadeInAustralia)

      const manufacturingCapabilitiesHeader = $('h4:contains("Manufacturing Capabilities")')
      let ManufacturingCapabilities = ''
      if (manufacturingCapabilitiesHeader.length === 0) {
        console.log('Manufacturing Capabilities section not found.')
      } else {
        const nextParagraph = manufacturingCapabilitiesHeader.closest('.iwithtext').next('p').html()

        if (nextParagraph) {
          ManufacturingCapabilities = nextParagraph
            .trim()
            .split(/<br\s*\/?>/i)
            .map((line) => line.trim())
            .join('; ')
        } else {
          console.log('No paragraph found after the Manufacturing Capabilities header.')
        }
      }
      console.log('Manufacturing Capabilities:', ManufacturingCapabilities)

      const valueAddingCapabilitiesHeader = $('strong:contains("Value Adding Capabilities")')
      let ValueAddingCapabilities = ''
      if (valueAddingCapabilitiesHeader.length === 0) {
        console.log('Value Adding Capabilities strong tag not found.')
      } else {
        const nextParagraphHtml = valueAddingCapabilitiesHeader
          .closest('h4')
          .closest('.iwithtext')
          .next('p')
          .html()
        if (nextParagraphHtml) {
          ValueAddingCapabilities = nextParagraphHtml
            .trim()
            .split(/<br\s*\/?>/i)
            .map((line) => line.trim())
            .join('; ')
        } else {
          console.log('No paragraph found after the Value Adding Capabilities strong tag.')
        }
      }
      console.log('Value Adding Capabilities: ', ValueAddingCapabilities)

      const minimumOrderQuantityHeader = $('h4:contains("Minimum Order Quantity")')
      let MinumumOrderQuantity = ''
      if (minimumOrderQuantityHeader.length === 0) {
        console.log('Minimum Order Quantity section not found.')
      } else {
        MinumumOrderQuantity = minimumOrderQuantityHeader
          .closest('.iwithtext')
          .next('p')
          .text()
          .trim()
      }
      console.log('Minimum Order Quantity:', MinumumOrderQuantity)

      const fabricsHeader = $('h4:contains("Fabrics")')
      let Fabrics = ''
      if (fabricsHeader.length === 0) {
        console.log('Fabrics section not found.')
      } else {
        const nextParagraphHtml = fabricsHeader.closest('.iwithtext').next('p').html()
        if (nextParagraphHtml) {
          Fabrics = nextParagraphHtml
            .trim()
            .split(/<br\s*\/?>/i)
            .map((line) => line.trim())
            .join('; ')
        } else {
          console.log('No paragraph found after the Fabrics h4 tag.')
        }
      }
      console.log('Fabrics:', Fabrics)

      const openToEnquiriesHeader = $('h4:contains("Open To Enquiries")')
      let OpenToEnquiries = ''
      if (openToEnquiriesHeader.length === 0) {
        console.log('Open To Enquiries section not found.')
      } else {
        OpenToEnquiries = openToEnquiriesHeader.closest('.iwithtext').next('p').text().trim()
      }
      console.log('Open To Enquiries: ', OpenToEnquiries)

      log.info(`Scraped ${Name}`, { url: request.loadedUrl })

      // Save data to the dataset
      await Dataset.pushData({
        Name,
        Description,
        Contact,
        'Follow On Social': FollowOnSocial,
        'Amount Made In Australia': AmountMadeInAustralia,
        'Manufacturing Capabilities': ManufacturingCapabilities,
        'Value Adding Capabilities': ValueAddingCapabilities,
        'Minimum Order Quantity': MinumumOrderQuantity,
        Fabrics: Fabrics,
        'Open To Enquiries?': OpenToEnquiries,
        'Logo URL': LogoURL,
      })
    }
  },
  proxyConfiguration: await Actor.createProxyConfiguration(),
  maxRequestsPerCrawl: 1000, // Limiting the number of requests to prevent hitting rate limits
  maxConcurrency: 100, // Adjust based on your system capabilities
})

// Run the crawler
await crawler.run()

// Exit the actor
await Actor.exit()

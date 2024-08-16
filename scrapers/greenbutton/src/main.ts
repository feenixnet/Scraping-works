import { Actor } from 'apify'
import { Dataset, PlaywrightCrawler, RequestQueue } from 'crawlee'

await Actor.init()

// Create a request queue
const requestQueue = await RequestQueue.open()
console.log('Request queue initialized')

// Initial URL to enqueue
await requestQueue.addRequest({
  url: 'https://gruener-knopf.de/en/gb-companies',
  uniqueKey: 'main page',
})
console.log('Main page request added to the queue')

// PlaywrightCrawler Configuration
const crawler = new PlaywrightCrawler({
  requestQueue,
  requestHandler: async ({ request, page, log }) => {
    if (request.uniqueKey === 'main page') {
      log.info('Processing main page')

      // Wait for the page to fully load
      await page.waitForSelector('.views-row')

      const elements = await page.$$('.views-row')
      console.log(`Found ${elements.length} company elements`)

      for (let index = 0; index < elements.length; index++) {
        const element = elements[index]
        console.log(`Processing element ${index + 1}`)

        // Extract company name
        const name = await element.$eval('h1 a', (el) => el.textContent?.trim() || '')
        console.log(`Company Name: ${name}`)

        const certifiedProducts = await element.evaluate((el) => {
          const mainElement = el.querySelector('div.gkno-cardshops')
          if (!mainElement) return 'Main element not found'

          const divs = mainElement.querySelectorAll('div')
          const spans: string[] = [] // Array to collect all span texts

          divs.forEach((div: HTMLElement) => {
            const span = div.querySelector('span')
            if (span) {
              spans.push(span.textContent?.trim() || '')
            }
          })

          return spans.join(';') // Join all span texts with ";"
        })

        console.log(`Certified Products: ${certifiedProducts}`)

        // Find 'More information about certification' link and get its href
        const detailPageUrl = await page.evaluate((el) => {
          const paragraphs = el.querySelectorAll('p')
          for (const p of paragraphs) {
            if (
              p.innerText.includes('More information about certification') ||
              p.innerText.includes('More information on the certification') ||
              p.innerText.includes('More information on certification') ||
              p.innerText.includes('Mehr Informationen zur Zertifizierung')
            ) {
              const anchor = p.querySelector('a')
              return anchor ? anchor.getAttribute('href') : null
            }
          }
          return null
        }, element)
        console.log(`Detail Page URL: ${detailPageUrl}`)

        console.log(`Extracting company website for element ${index + 1}`)

        const companyWebsiteData = await element.evaluate((el) => {
          // Collect information about anchor elements
          const anchors = el.querySelectorAll('a')

          // Prepare a data object to return
          const data = {
            numberOfAnchors: anchors.length,
            anchorInfo: [] as { text: string; href: string | null }[],
            websiteUrl: '',
          }

          anchors.forEach((a) => {
            // Collect anchor text and href
            const anchorText = a.textContent?.trim() || ''
            const href = a.getAttribute('href')

            // Store information about each anchor
            data.anchorInfo.push({ text: anchorText, href })

            if (
              anchorText.includes('Visit company website') ||
              anchorText.includes('ZUR WEBSEITE')
            ) {
              data.websiteUrl = href || ''
            }
          })

          return data
        })
        console.log(`Company website: ${companyWebsiteData.websiteUrl}`)

        if (name && detailPageUrl) {
          const absoluteUrl = new URL(detailPageUrl as string, request.url).href

          await requestQueue.addRequest({
            url: absoluteUrl,
            uniqueKey: `detailPage-${index}`,
            userData: { name, certifiedProducts, companyWebsite: companyWebsiteData.websiteUrl },
          })
          console.log(`Added detail page request: ${absoluteUrl}`)
        } else {
          console.log(`Skipped element ${index + 1} due to missing company name or detail page URL`)
        }
      }
    } else {
      const { userData } = request
      const { name, certifiedProducts, companyWebsite } = userData

      // Wait for the detail page to load
      await page.waitForSelector(
        'body > div.wrapper > ral-root > div > ral-public-pages > div > div > div > ng-component > div > div:nth-child(4) > div > p:nth-child(3)',
        { timeout: 30000 }
      )

      const addressText = await page
        .evaluate(() => {
          const possibleSelectors = [
            'body > div.wrapper > ral-root > div > ral-public-pages > div > div > div > ng-component > div > div:nth-child(4) > div > p:nth-child(3)',
            'body > div.wrapper > ral-root > div > ral-public-pages > div > div > div > ng-component > div > div:nth-child(4) > div > p',
          ]
          for (const selector of possibleSelectors) {
            const element = document.querySelector(selector)
            if (element) {
              // Handle <br> tags by joining their text content with ", "
              return Array.from(element.childNodes)
                .map((node) => {
                  if (node.nodeType === Node.TEXT_NODE) {
                    // Use nullish coalescing to provide a default empty string if textContent is undefined
                    return node.textContent?.trim() ?? ''
                  } else if (node.nodeType === Node.ELEMENT_NODE && node.nodeName === 'BR') {
                    return ' ' // Replace <br> with a space
                  }
                  return ''
                })
                .filter((text) => text.length > 0)
                .join(', ')
            }
          }
          return 'Address not found'
        })
        .catch(() => {
          console.log('Address element not found on detail page')
          return 'Address not found'
        })

      const address = addressText
        .replace(/Anschrift:/i, '') // Remove the 'Anschrift:' prefix (case insensitive)
        .split(',') // Split the string by ', '
        .map((line) => line.trim()) // Trim each line
        .slice(2) // Exclude the first item
        .filter((line) => line.length > 0) // Filter out empty lines
        .join(', ') // Join the lines back into a single string

      console.log('address: ', address)

      // Extract the date of assessment data
      const dateOfAssessment = await page.evaluate(() => {
        const rows = document.querySelectorAll('table tr')
        let dateOfAssessmentValue = ''

        rows.forEach((row) => {
          const tds = row.querySelectorAll('td')
          if (tds.length > 1 && tds[0].textContent?.includes('Prüfungsdatum')) {
            dateOfAssessmentValue = tds[1].textContent?.trim() || ''
          }
        })

        return dateOfAssessmentValue
      })
      console.log(`Date of Assessment: ${dateOfAssessment}`)

      // Extract the validFrom data
      const validFrom = await page.evaluate(() => {
        const rows = document.querySelectorAll('table tr')
        let validFromValue = ''

        rows.forEach((row) => {
          const tds = row.querySelectorAll('td')
          if (tds.length > 1 && tds[0].textContent?.includes('Gültig ab')) {
            validFromValue = tds[1].textContent?.trim() || ''
          }
        })

        return validFromValue
      })
      console.log(`Valid From: ${validFrom}`)

      // Extract the valid to  data
      const validTo = await page.evaluate(() => {
        const rows = document.querySelectorAll('table tr')
        let validToValue = ''

        rows.forEach((row) => {
          const tds = row.querySelectorAll('td')
          if (tds.length > 1 && tds[0].textContent?.includes('Gültig bis')) {
            validToValue = tds[1].textContent?.trim() || ''
          }
        })

        return validToValue
      })
      console.log(`Valid To: ${validTo}`)

      log.info(`Scraped ${name}`, { url: request.url })

      // Save data to the dataset
      await Dataset.pushData({
        Name: name,
        Address: address,
        'Date of assessment': dateOfAssessment,
        'Valid from': validFrom,
        'Valid to': validTo,
        'Profile url': request.url,
        Website: companyWebsite,
        'Certified products': certifiedProducts,
      })
      console.log(`Data saved for ${name}`)
    }
  },
  proxyConfiguration: await Actor.createProxyConfiguration(),
  maxRequestsPerCrawl: 1000,
  maxConcurrency: 100,
})

console.log('Starting the crawler...')
await crawler.run()
console.log('Crawler finished')

// Exit the actor
await Actor.exit()
console.log('Actor exited')

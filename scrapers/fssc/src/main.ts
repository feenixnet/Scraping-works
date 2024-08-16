import { Actor } from 'apify'
import { Dataset, PlaywrightCrawler } from 'crawlee'
import { Page } from 'playwright'

const LIMIT = 500 // Number of items per request
let lastSuccessfulOffset = 0 // Track the last successful offset

interface CertificateResponse {
  position: string
  certificates: Certificate[]
  limit: string
  offset: string
  total: string
}

interface Certificate {
  id: string
  organisation: {
    name: string
    address: {
      street?: string
      zipcode?: string
      city?: string
      state?: string
      country: string
      coordinates?: {
        latitude: string
        longitude: string
      }
    }
  }
  title: string
  titleSanitized: string
  initialCertification: string
  scopeStatement: string
  decision: string
  issued: string
  status: string
  validUntil: string
  lastStatusDecision: string
  categoryFoodChain: {
    position: string
    categories: Category[]
  }
  categoryProductType: {
    position: string
    categories: Category[]
  }
  categoryCertification: {
    position: string
    categories: Category[]
  }
  categoryCountry: {
    position: string
    categories: Category[]
  }
  gfsi: string
  gfsiRecognized: string
  coid: string
  scheme: string
}

interface Category {
  id: string
  parentId: string
  slug: string
  name: string
  shortName: string
  label: string
  description: string
  children: string
}

async function fetchData(page: Page, offset: number): Promise<void> {
  const url = `https://www.fssc.com/wp-admin/admin-ajax.php?certificationCategories=1&action=certificate_getCertificates&offset=${offset}&limit=${LIMIT}`

  const headers = {
    accept: 'application/json, text/javascript, */*; q=0.01',
    'accept-language': 'en-US,en;q=0.9',
    cookie:
      'wordpress_google_apps_login=2883d08c033e2b1356a32721bffabaae; _gid=GA1.2.146899813.1721969254; _hjSessionUser_3630481=eyJpZCI6IjU0ZjdjOGVmLWM4ZTctNTc1NS1hNWQ5LTU3ZjM1ZjBkY2IwYiIsImNyZWF0ZWQiOjE3MjE5NjkyNTY1OTYsImV4aXN0aW5nIjp0cnVlfQ==; _hjSession_3630481=eyJpZCI6ImE3NDVhYjU5LWI2YTItNDY0Ny1hNDUwLWE1MzkzZDA2MDZmNyIsImMiOjE3MjIxNTA5MDQ4NTUsInMiOjAsInIiOjAsInNiIjowLCJzciI6MCwic2UiOjAsImZzIjowLCJzcCI6MH0=; _gat_gtag_UA_132308722_2=1; _ga_PJ8ZSBPVCL=GS1.1.1722150901.7.1.1722150905.0.0.0; _ga=GA1.1.1431927185.1721969254; _hp2_id.2596422895=%7B%22userId%22%3A%22548223029728741%22%2C%22pageviewId%22%3A%221097377183988941%22%2C%22sessionId%22%3A%226947298834166135%22%2C%22identity%22%3Anull%2C%22trackerVersion%22%3A%224.0%22%7D; _hp2_ses_props.2596422895=%7B%22r%22%3A%22https%3A%2F%2Fwww.fssc.com%2Fpublic-register%2F%3FcertificationCategories%3D1%22%2C%22ts%22%3A1722150900980%2C%22d%22%3A%22www.fssc.com%22%2C%22h%22%3A%22%2Fpublic-register%2FSRB-1-1674-656099%2F%22%7D',
    priority: 'u=1, i',
    referer: 'https://www.fssc.com/public-register/',
    'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'x-requested-with': 'XMLHttpRequest',
  }

  const response: CertificateResponse = await page.evaluate(
    ({ url, headers }: { url: string; headers: Record<string, string> }) => {
      return fetch(url, {
        method: 'GET',
        headers,
      }).then((response) => response.json())
    },
    { url, headers }
  )

  console.log(`Response from offset ${offset}:`, response)

  // Process each certificate item
  await Promise.all(
    response.certificates.map(async (item: Certificate) => {
      const addressParts = []
      if (item.organisation.address.street) addressParts.push(item.organisation.address.street)
      if (item.organisation.address.zipcode) addressParts.push(item.organisation.address.zipcode)
      if (item.organisation.address.city) addressParts.push(item.organisation.address.city)
      if (item.organisation.address.state) addressParts.push(item.organisation.address.state)
      addressParts.push(item.organisation.address.country)

      const address = addressParts.join(', ')

      const record = {
        companyName: item.title,
        country: item.organisation.address.country,
        certificateStatus: `Valid until ${item.validUntil}`,
        scheme: item.scheme,
        certificateValidUntil: item.validUntil,
        coid: item.coid,
        address: address,
        productTypes:
          item.categoryProductType?.categories?.map((type: Category) => type.name).join(';') || '',
        scopeStatement: item.scopeStatement,
        categories:
          item.categoryFoodChain?.categories
            ?.map((category: Category) => `${category.name}`.replace(':', '-'))
            .join(';') || '',
      }

      await Dataset.pushData(record)
    })
  )

  // Update the last successful offset
  lastSuccessfulOffset = offset + LIMIT

  // Check if more data is available
  if (response.certificates.length > 0) {
    offset += LIMIT
    await fetchData(page, offset) // Fetch next set of data
  } else {
    console.log('No more data to fetch.')
  }
}

const crawler = new PlaywrightCrawler({
  maxRequestRetries: 100, // Set maximum number of retries for each request
  requestHandlerTimeoutSecs: 1200, // Increase the timeout for the requestHandler
  async requestHandler({ page }) {
    try {
      await fetchData(page, lastSuccessfulOffset)
    } catch (error) {
      console.error('Error during request:', error)
    }
  },
})

await Actor.init()
  .then(() => crawler.run(['https://www.fssc.com/public-register/?certificationCategories=1']))
  .catch((error) => console.error('Error during actor execution:', error))
  .finally(() => Actor.exit())

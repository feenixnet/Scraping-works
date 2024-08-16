import { Actor } from 'apify'
import { Dataset, PlaywrightCrawler } from 'crawlee'
import XLSX from 'xlsx'

await Actor.init()

const proxyConfiguration = await Actor.createProxyConfiguration()

const crawler = new PlaywrightCrawler({
  proxyConfiguration,
  requestHandlerTimeoutSecs: 1200, // Increase timeout to 1200 seconds
  requestHandler: async ({ request, page, log }) => {
    log.info(`Navigating to ${request.url}`)

    try {
      // Navigate to the page
      await page.goto(request.url)
      log.info(`Successfully navigated to ${request.url}`)

      // Click the download button
      const downloadButtonSelector =
        '#main-content > div > div:nth-child(5) > div > div:nth-child(2) > div:nth-child(2) > div > ul > li:last-child > a'
      log.info(`Clicking download button with selector: ${downloadButtonSelector}`)
      await page.click(downloadButtonSelector)

      // Wait for download
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.click(downloadButtonSelector),
      ])

      // Save the file
      const tempFilePath: string = await download.path()
      if (!tempFilePath) {
        log.error('Failed to get the download path.')
        return
      }

      log.info(`Parsing XLSX file at ${tempFilePath}`)
      // Parse the XLSX file
      const workbook = XLSX.readFile(tempFilePath)
      const sheetNames = workbook.SheetNames
      const sheet = workbook.Sheets[sheetNames[0]]

      // Convert sheet to JSON, including the first row as header
      const dataWithHeader: (string | number)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 })

      if (dataWithHeader.length === 0) {
        log.error('No data found in the XLSX file.')
        return
      }

      // Extract header (first row) and data (remaining rows)
      const [header, ...dataRows] = dataWithHeader

      // Check if header is an array and if dataRows is an array
      if (!Array.isArray(header) || !Array.isArray(dataRows)) {
        log.error('Invalid data format in XLSX file.')
        return
      }

      // Skip the first 3 rows of data
      const dataToProcess = dataRows.slice(3)

      // Convert data rows to JSON objects using header
      const formattedData = dataToProcess.map((row: (string | number)[]) => {
        const rowData: { [key: string]: string | number | undefined } = {}
        header.forEach((key: string | number, index: number) => {
          if (typeof key === 'string') {
            rowData[key] = row[index]
          }
        })
        return rowData
      })

      // Log the number of rows parsed
      log.info(`Parsed ${formattedData.length} rows from XLSX file.`)

      // Store each row as an individual JSON object in Dataset
      for (const row of formattedData) {
        await Dataset.pushData(row)
      }
      log.info('All rows have been saved to the Dataset.')
    } catch (error: unknown) {
      const errorMessage = (error as Error).message || 'Unknown error occurred'
      log.error(`Error occurred: ${errorMessage}`)
    }
  },
})

// Replace the URL with the URL of the page where the download link is present
await crawler.run(['https://organic.ams.usda.gov/integrity/Reports/DataHistory'])

await Actor.exit()

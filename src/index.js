// Force sentry DSN into environment variables
// In the future, will be set by the stack
process.env.SENTRY_DSN =
  process.env.SENTRY_DSN ||
  'https://5d3ab92b26ba449ca664509b7e4a8784@sentry.cozycloud.cc/114'

const {
  BaseKonnector,
  requestFactory,
  saveBills,
  errors,
  log
} = require('cozy-konnector-libs')

const moment = require('moment')
moment.locale('fr')

const request = requestFactory({
  debug: false,
  cheerio: true,
  json: false,
  jar: true
})

const requestJson = requestFactory({
  debug: false,
  cheerio: false,
  json: true,
  jar: true
})

const vendor = 'semitag'
const currency = '€'
const service = 'tagandpass'
const loginUrl = 'https://www.tag.fr/171-votre-compte-tag-pass.htm'
const baseUrl = 'https://tag-and-pass.tag.fr'
const tokenUrl = `${baseUrl}/redirect`
const invoicesUrl = `${baseUrl}/api/account/factures`

module.exports = new BaseKonnector(start)

// The start function is run by the BaseKonnector instance only when it got all the account
// information (fields). When you run this connector yourself in "standalone" mode or "dev" mode,
// the account information come from ./konnector-dev-config.json file
async function start(fields) {
  log('info', 'Authenticating ...')
  await authenticate(fields.login, fields.password)
  log('info', 'Successfully logged in')

  log('info', 'Retrieve list of invoices')
  const invoices = await requestJson(invoicesUrl)

  log('info', 'Generate bills from invoices')
  const bills = await generateBills(invoices)

  log('info', 'Saving bills to Cozy')
  await saveBills(bills, fields, {
    identifiers: [vendor],
    contentType: 'application/pdf'
  })
}

// this shows authentication using the [signin function](https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#module_signin)
// even if this in another domain here, but it works as an example
async function authenticate(username, password) {
  const $response = await request(loginUrl, {
    method: 'POST',
    formData: {
      ECN_EMAIL: username,
      ECN_PASSWORD: password
    }
  })

  const disconnectLink = $response('.disconnect')
  if (disconnectLink.length !== 1) {
    throw new Error('LOGIN_FAILED')
  }

  const redirectUrl = $response('iframe').attr('src')
  if (!redirectUrl) {
    throw new Error(errors.LOGIN_FAILED)
  }

  const queryParams = redirectUrl.match('token=.+')
  const correctedUrl = `${tokenUrl}?${queryParams}`
  return request(correctedUrl)
}

function generateBills(invoices) {
  return invoices.map(item => {
    const amount = item.montant
    const amountStr = `${amount.toFixed(2)}${currency}`
    const date = moment.utc(item.date, 'YYYY-MM-DD').endOf('month')
    const dateStr = date.format('YYYY-MM-DD')
    const fileurl = `${baseUrl}${item.url}`
    const filename = `${dateStr}_${service}_${amountStr}_${item.numero}.pdf`

    return {
      vendor: vendor,
      date: date.toDate(),
      amount: amount,
      currency: currency,
      fileurl: fileurl,
      filename: filename,
      metadata: {
        importDate: new Date(),
        version: 1
      }
    }
  })
}

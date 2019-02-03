const {
  BaseKonnector,
  requestFactory,
  saveBills,
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
  await authenticate(fields.email, fields.password)
  log('info', 'Successfully logged in')

  log('info', 'Retrieve list of invoices')
  const invoices = await requestJson(invoicesUrl)

  log('info', 'Generate bills from invoices')
  const bills = await generateBills(invoices)

  log('info', 'Saving bills to Cozy')
  await saveBills(bills, fields, {
    identifiers: ['semitag'],
    contentType: 'application/pdf'
  })
}

// this shows authentication using the [signin function](https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#module_signin)
// even if this in another domain here, but it works as an example
async function authenticate(username, password) {
  return request(loginUrl, {
    method: 'POST',
    formData: {
      ECN_EMAIL: username,
      ECN_PASSWORD: password
    }
  }).then($ => {
    const disconnectLink = $('.disconnect')
    if (disconnectLink.length !== 1) {
      throw new Error('LOGIN_FAILED')
    }

    const redirectUrl = $('iframe').attr('src')
    if (!redirectUrl) {
      throw new Error('LOGIN_FAILED')
    }

    const queryParams = redirectUrl.match('token=.+')
    const correctedUrl = `${tokenUrl}?${queryParams}`
    return request(correctedUrl)
  })
}

function generateBills(invoices) {
  return invoices.map(item => {
    const date = moment(item.date)
    const fileurl = `${baseUrl}${item.url}`
    const filename = `${date.format('YYYY-MM')}_tagandpass.pdf`

    return {
      vendor: 'semitag',
      date: date.toDate(),
      amount: item.montant,
      currency: 'EUR',
      fileurl: fileurl,
      filename: filename,
      metadata: {
        importDate: new Date(),
        version: 1
      }
    }
  })
}

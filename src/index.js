const {
  BaseKonnector,
  requestFactory,
  saveBills,
  errors,
  log
} = require('cozy-konnector-libs')

const moment = require('moment')
moment.locale('fr')

const toStream = require('buffer-to-stream')

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
const loginUrl = 'https://www.tag.fr/171-votre-compte-pass-mobilites.htm'
const baseUrl = 'https://tag-and-pass.tag.fr'
const invoicesUrl = `${baseUrl}/api/factures`

module.exports = new BaseKonnector(start)

// The start function is run by the BaseKonnector instance only when it got all the account
// information (fields). When you run this connector yourself in "standalone" mode or "dev" mode,
// the account information come from ./konnector-dev-config.json file
async function start(fields) {
  log('info', 'Authenticating ...')
  const token = await authenticate(fields.login, fields.password)
  log('info', 'Successfully logged in')

  log('info', 'Retrieve list of invoices')
  const invoices = await requestJson(invoicesUrl, {
    headers: { Authorization: `Bearer ${token}` }
  })

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
      ECN_PASSWORD: password,
      login: 'Accédez+à+votre+espace',
      idtf: '171',
      from: loginUrl,
      TPL_CODE: 'TPL_TAGANDGO'
    }
  })

  const disconnectLink = $response('a.disconnected')
  if (disconnectLink.length !== 1) {
    throw new Error('LOGIN_FAILED')
  }

  const redirectUrl = $response('iframe').attr('src')
  if (!redirectUrl) {
    throw new Error(errors.LOGIN_FAILED)
  }

  await request(redirectUrl)

  const queryParams = redirectUrl.match('token=.+')
  const token = queryParams[0].split('=')[1]
  return token
}

function generateBills(invoices) {
  return invoices.map(async item => {
    const amount = item.montant / 100.0
    const amountStr = `${amount.toFixed(2)}${currency}`
    const date = moment.utc(item.date, 'YYYY-MM-DD')
    const dateStr = date.format('YYYY-MM-DD')
    const fileurl = `${baseUrl}${item.urlPdf}`
    const filename = `${dateStr}_${service}_${amountStr}_${item.numero}.pdf`
    const filecontent = await requestJson(fileurl)

    return {
      vendor: vendor,
      date: date.endOf('month').toDate(),
      amount: amount,
      currency: currency,
      contentType: filecontent.fileType,
      filestream: toStream(Buffer.from(filecontent.content, 'base64')),
      filename: filename,
      metadata: {
        importDate: new Date(),
        version: 2
      }
    }
  })
}

const fs = require("node:fs/promises");
const path = require("node:path");

const config = {
    screenPaymentURL: "",
    csvFileName: "",
    csvFileDir: "CURRENT", // CURRENT or directory path to file

    tokenURL: "",
    grantType: "",
    clientId: "",
    clientSecret: ""
}

let global = {
    tokenValue: "",
    paymentList: [] // string list
}



const readCsv = async () => {
    // CSV schema = single column, each row = base64 encoded raw payment message (xml)
    // load from csv
    // decode from base64
    // store in global.paymentList
    if (!config.csvFileName) {
        throw new Error("CSV FILE NAME IS NOT SET")
    }

    const csvDir = config.csvFileDir === "CURRENT" ? process.cwd() : config.csvFileDir;
    const csvFilePath = path.resolve(csvDir, config.csvFileName);
    const csvContent = await fs.readFile(csvFilePath, "utf8");

    global.paymentList = csvContent
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .map((row) => row.trim())
        .filter((row) => row.length > 0)
        .map((row) => Buffer.from(row, "base64").toString("utf8"));
}

const getToken = async () => {
    const body = new URLSearchParams();
    body.append("grant_type", config.grantType)
    body.append("client_id", config.clientId)
    body.append("client_secret", config.clientSecret)

    const response = await fetch(config.tokenURL, {
        method: "POST",
        headers: {
            "Content-Type":"application/x-www-form-urlencoded",
        },
        body: body
    })

    if(!response.ok) {
        throw new Error(`TOKEN REQUEST ERROR: ${response.status}:${response.statusText}`)
    }
    const tokenData = response.json()
    global.tokenValue = tokenData.access_token;
}

const screenPayment = async (paymentRaw) => {
    if(!global.tokenValue) {
        throw new Error("TOKEN MISSING OR NOT SET")
    }
    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/xml",
            "Authorization": `${global.tokenValue}`
        },
        body: paymentRaw
    }

    const response = await fetch(config.screenPaymentURL, options)
    if(!response.ok) {
        throw new Error(`PAYMENT SCREENING FAILED: ${response.status}:${response.statusText}`)
    }
    const result = await response.json()
    console.log(result)
}

const run = async () => {
    await readCsv()
    await getToken()

    for(let i = 0; i < global.paymentList.length; i++) {
        await screenPayment(global.paymentList[i])
    }
}

run().catch((error) => {
    console.error('ERROR WHILE PROCESSING:',error)
})

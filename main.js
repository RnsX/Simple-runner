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
    const tokenData = await response.json()
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

const runBatch = async (batchCount) => {
    if (!Number.isInteger(batchCount) || batchCount < 1) {
        throw new Error("BATCH COUNT MUST BE A POSITIVE INTEGER")
    }

    const batches = Array.from({ length: batchCount }, () => []);
    global.paymentList.forEach((payment, index) => {
        batches[index % batchCount].push(payment)
    })

    const requestStreams = batches.map(async (batch) => {
        for (const payment of batch) {
            await screenPayment(payment)
        }
    })

    await Promise.all(requestStreams)
}

const run = async (batchCount) => {
    await readCsv()
    await getToken()
    await runBatch(batchCount)
}

const batchCount = Number(process.argv[2] ?? 1);

run(batchCount).catch((error) => {
    console.error('ERROR WHILE PROCESSING:',error)
})

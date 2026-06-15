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
    paymentList: [] // { base64, msgId } list
}

const parseCsvRow = (row) => {
    const values = [];
    let value = "";
    let quoted = false;

    for (let i = 0; i < row.length; i++) {
        const char = row[i];

        if (char === '"') {
            if (quoted && row[i + 1] === '"') {
                value += '"';
                i++;
            } else {
                quoted = !quoted;
            }
        } else if (char === "," && !quoted) {
            values.push(value);
            value = "";
        } else {
            value += char;
        }
    }

    values.push(value);
    return values;
}

const readCsv = async () => {
    if (!config.csvFileName) {
        throw new Error("CSV FILE NAME IS NOT SET")
    }

    const csvDir = config.csvFileDir === "CURRENT" ? process.cwd() : config.csvFileDir;
    const csvFilePath = path.resolve(csvDir, config.csvFileName);
    const csvContent = await fs.readFile(csvFilePath, "utf8");

    const rows = csvContent
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .filter((row) => row.trim().length > 0);

    if (rows.length === 0) {
        global.paymentList = [];
        return;
    }

    const headers = parseCsvRow(rows[0]).map((header) => header.trim());
    const paymentBase64Index = headers.indexOf("payment_base64");
    const messageIdIndex = headers.indexOf("message_id");

    if (paymentBase64Index === -1 || messageIdIndex === -1) {
        throw new Error('CSV MUST CONTAIN "payment_base64" AND "message_id" COLUMNS');
    }

    global.paymentList = rows.slice(1).map((row) => {
        const values = parseCsvRow(row);
        return {
            base64: values[paymentBase64Index],
            msgId: values[messageIdIndex]
        };
    });
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
        const paymentRaw = Buffer.from(global.paymentList[i].base64, "base64").toString("utf8");
        await screenPayment(paymentRaw)
    }
}

run().catch((error) => {
    console.error('ERROR WHILE PROCESSING:',error)
})

const total_accounts = 10000000;
const contract = 'emanateoneos';
const table_name = 'accounts';
const eos_api = "http://node1.eosphere.io";

const fetch = require('node-fetch');
const fs = require('fs');
let initTime, endTime;
let intervalTimer;
let accounts = new Set();
// let is_set = false;
let counter = 0;
let lastSize = 0;
// const unclaimed = new Set();
// const claimed = new Set();
// let total_unclaimed_amount = 0;
// let total_claimed_amount = 0;
const unclaimed_list = './accounts.txt';
// const unclaimed_list = './unclaimed.txt';
if (fs.existsSync(unclaimed_list)) {
    fs.unlinkSync(unclaimed_list);
}
const unclaimedList = fs.createWriteStream(unclaimed_list, {flags: 'a'});

async function recursiveFetchTableRows(code, table, start, limit, batch) {
    const req = {
        code: code,
        table: table,
        limit: batch,
        upper_bound: null
    };
    if (start !== 0) {
        req['lower_bound'] = start;
    } else {
        req['lower_bound'] = null;
    }
    let result;
    try {
        const response = await fetch(eos_api + '/v1/chain/get_table_by_scope', {
            method: 'POST',
            body: JSON.stringify(req),
            headers: {'Content-Type': 'application/json'},
        });
        result = (await response.json()).rows;
        if (!result) {
            console.log('No more results!');
            stopScanning();
        } else {
            for (const row of result) {
                accounts.add(row['scope']);
                await processTableRow(row['scope']);
                counter++;
            }
            const len = accounts.size;
            const last = result[result.length - 1]['scope'];
            if (len < limit) {
                if (lastSize !== len) {
                    lastSize = len;
                    setTimeout(async () => {
                        const _batch = (limit > (len + batch)) ? batch : (limit - len + 1);
                        await recursiveFetchTableRows(code, table, last, limit, _batch);
                    }, 5);
                } else {
                    console.log('Table end reached!');
                    stopScanning();
                }
            } else {
                console.log('Limit reached!');
                stopScanning();
            }
        }
    } catch (e) {
        console.log(e);
        stopScanning();
    }
}

async function processTableRow(account) {
    const req = {
        code: contract,
        table: table_name,
        scope: account,
        json: true
    };
    const response = await fetch(eos_api + '/v1/chain/get_table_rows', {
        method: 'POST',
        body: JSON.stringify(req),
        headers: {'Content-Type': 'application/json'},
    });
    const result = (await response.json()).rows[0];
    if (result) {
        const balance = parseFloat(result['balance'].split(" ")[0]);
        if (balance > 10) {
            unclaimedList.write(account + "," + balance + '\n');
        }
    }
    // if (result['claimed'] === 0) {
    //     unclaimed.add(account);
    //     total_unclaimed_amount += balance;
    //     unclaimedList.write(account + "," + balance + '\n');
    // } else {
    //     claimed.add(account);
    //     total_claimed_amount += balance;
    // }
}

function stopScanning() {
    console.log('Iteration is over!');
    endTime = Date.now();
    console.log(`${accounts.size} entries scanned in ${(endTime - initTime) / 1000} seconds!`);
    // console.log(`Total Claimed balance:   ${total_claimed_amount.toFixed(4)} from ${claimed.size} accounts`);
    // console.log(`Total Unclaimed balance: ${total_unclaimed_amount.toFixed(4)} from ${unclaimed.size} accounts`);
    console.log('---------------- End ---------------------');
    clearInterval(intervalTimer);
    is_set = true;
}

(async () => {
    console.log('---------------- Start ---------------------');
    console.log(`Contract: ${contract}`  );
    console.log(`Table:    ${table_name}`);
    intervalTimer = setInterval(() => {
        console.log(`${counter} rows/s - ${accounts.size}`);
        counter = 0;
    }, 1000);
    initTime = Date.now();
    await recursiveFetchTableRows(contract, table_name, 0, total_accounts, 1000);
})();

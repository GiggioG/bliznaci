process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;
const tls = require('tls');
const colors = require('colors');
const readline = require('readline');
const pem = require('pem');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
const generateKeys = _ => new Promise(resolve => {
    pem.createCertificate({ days: 1, selfSigned: true }, function(err, keys) { resolve(keys); });
});
const request = (url, keys) => new Promise((resolve, reject) => {
    if (!url.startsWith("gemini://")) { url = "gemini://" + url; }
    let address = url.split("gemini://")[1].split('?')[0].split('/')[0];
    let port;
    if (address.includes(':')) {
        port = Number(address.split(':')[1]);
        address = address.split(':')[0];
    }
    let data = "";
    let socket = tls.connect(port || 1965, address, {
        key: keys.clientKey,
        cert: keys.certificate //,
            //ca: [keys.serviceKey]
    });
    socket.setEncoding('utf8');
    socket.write(`${url}\r\n`);
    socket.on('data', (d) => {
        data += d;
    });
    socket.on('end', () => {
        if (data.length > 0) {
            resolve({
                header: {
                    code: data.split('\r\n')[0].split(' ')[0],
                    meta: data.split('\r\n')[0].slice(data.indexOf(' ') + 1)
                },
                body: data.slice(data.indexOf('\r\n') + 1),
                raw: data,
                url,
                address,
                port
            });
        } else {
            reject(new Error("no response"));
        }
    });
});
const prompt = q => new Promise((resolve, reject) => {
    rl.question(q, a => {
        resolve(a);
    });
});
const renderPage = data => {
    console.clear();
    let addressBarWidth = data.url.length + 2;
    let metaBarWidth = 7 + data.header.meta.length;
    console.log(` ${'-'.repeat(addressBarWidth)} ` + ' ' + `/${'-'.repeat(metaBarWidth)}\\`);
    console.log(`! ${data.url} !` + ' ' + `| ${data.header.code} | ${data.header.meta} |`);
    console.log(`!${'_'.repeat(addressBarWidth)}!` + ' ' + `\\${'-'.repeat(metaBarWidth)}/`);
    let linkN = 0;
    let preformat = false;
    for (line of data.body.split('\n')) {
        if (preformat) {
            if (line.startsWith("```")) {
                preformat = false;
                continue;
            }
            console.log(colors.grey(line));
            continue;
        }
        if (line.startsWith("=>")) {
            linkN++;
            if (line.startsWith('=> ')) {
                line = line.slice(3);
            } else {
                line = line.slice(2);
            }
            line = line.slice(line.indexOf(' ') + 1);
            console.log(colors.magenta(`[${linkN}] => ${line.trim()}`));
        } else if (line.startsWith('>')) {
            console.log(colors.green(`> ${line.slice(1).trim()}`));
        } else if (line.startsWith('# ')) {
            console.log(colors.cyan(`# ${line.slice(1).trim()}`));
        } else if (line.startsWith('## ')) {
            console.log(colors.red(`## ${line.slice(2).trim()}`));
        } else if (line.startsWith('### ')) {
            console.log(colors.yellow(`### ${line.slice(3).trim()}`));
        } else if (line.startsWith('#### ')) {
            console.log(colors.blue(`#### ${line.slice(4).trim()}`));
        } else if (line.startsWith('##### ')) {
            console.log(colors.blue(`##### ${line.slice(5).trim()}`));
        } else if (line.startsWith('###### ')) {
            console.log(colors.blue(`###### ${line.slice(6).trim()}`));
        } else if (line.startsWith("```")) {
            preformat = !preformat;
        } else {
            console.log(line);
        }
    }
};
const parceCmd = async(cmd, data, history) => {
    switch (cmd) {
        case 'exit':
        case 'e':
            {
                process.exit(20);
            }
            break;
        case 'reload':
        case 'r':
            {
                return [true, data.url, true];
            }
            break;
        case 'linkinfo':
        case 'li':
            {
                let linkNumStr = await prompt("#");
                let linkNum = Number(linkNumStr);
                let linkUrl = data.body.match(/(?<==>\s*)\S+/g)[linkNum - 1];
                console.log(linkUrl);
                return [true, data.url, false];
            }
            break;
        case 'link':
        case 'l':
            {
                let linkNumStr = await prompt("#");
                if (linkNumStr == "\\cancel") { return [false, `canceled`, false]; }
                let linkNum = Number(linkNumStr);
                if (data.body.match(/(?<==>\s*)\S+/g).length < linkNum) {
                    return [false, `only ${data.body.match(/(?<==>\s*)\S+/g).length} links found on page, but you asked for link ${linkNum}`, false];
                }
                let linkUrl = data.body.match(/(?<==>\s*)\S+/g)[linkNum - 1];
                if (linkUrl.startsWith('/')) {
                    linkUrl = `${data.address}${data.port?':'+data.port:''}${linkUrl}`;
                }
                if (linkUrl.includes("://") && (!linkUrl.includes("gemini://"))) {
                    return [false, `link number ${linkNum} is not a \"gemini://\" link, but a \"${linkNum.split("://")[0]}\"`, false];
                }
                history.push(data.url)
                return [true, linkUrl, true, history];
            }
            break;
        case 'back':
        case 'b':
            {
                if (history.length <= 0) {
                    return [false, `history empty, no more links to go back`, false];
                }
                let url = history.pop();
                return [true, url, true];
            }
            break;
        case "history":
        case "h":
            {
                console.log(history);
                return [true, data.url, false];
            }
            break;
        case "setK":
            {
                return [true, "gemini://gus.guru", false];
            }
            break;
        case "goK":
            {
                return [true, data.url, true];
            }
            break;
        case '':
        default:
            {
                return [true, data.url, false];
            }
            break;
    }
};
(async() => {
    let keys = await generateKeys();
    let url = 'gus.guru';
    let history = [];
    while (true) {
        let data = await request(url, keys);
        renderPage(data);
        if (data.header.code.startsWith('3')) {
            if (data.header.meta.startsWith('/')) {
                url = `${data.address}${data.port?':'+data.port:''}${data.header.meta}`;
            } else {
                url = data.header.meta;
            }
            continue;
        }
        if (data.header.code.startsWith('1')) {
            let ans = await prompt(`${data.header.meta} }`);
            if (ans == "\\cancel") {
                url = history.pop();
                continue;
            }
            history.push(url);
            url = `${url}?${ans}`;
            continue;
        }
        while (true) {
            cmd = await prompt('>');
            if (cmd.startsWith(':')) {
                [success, result, changeurl] = await parceCmd(cmd.slice(1), data, history);
                if (success) {
                    url = result;
                    if (changeurl) { break; }
                } else {
                    console.log(`< error in \"${cmd}\": ${result}`);
                }
            } else if (cmd == "") {

            } else {
                history.push(url);
                url = cmd;
                break;
            }
        }
    }
})();
import * as https from 'https';
import { IncomingMessage } from 'http';
import { workspace } from 'vscode';
import * as iconv from 'iconv-lite';
import * as stringWidth from 'string-width';
import { isArray } from 'util';
import { Stock, StockConfig } from './stockResource';


const httpRequest = async (url: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    
    https.get(url, { headers: { 'Referer': 'https://finance.sina.com.cn' } }, (res: IncomingMessage) => {
      let chunks: Array<Buffer> = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        // Sometimes the 'error' event is not fired. Double check here.
        if (res.statusCode === 200) {
          let buff = Buffer.concat(chunks as any);
          const contentType: String = res.headers['content-type'] || '';
          const matchCharset = contentType.match(/(?:charset=)(\w+)/) || [];
          // 转编码，保持跟响应一致
          let body = iconv.decode(buff, matchCharset[1] || 'utf8');
          resolve(body);
        } else {
          reject(new Error(`网络请求错误! (HTTP ${res.statusCode})`));
        }
      });
    }).on('error', err => reject(err));
  });
};


export function sinaApi(stockConfig: StockConfig): Promise<Array<Stock>> {
  const config = workspace.getConfiguration();
  const emojiConfig = config.get('super-stock.emoji', ["🍾️", "🍜"]);

  const url = 'https://hq.sinajs.cn/list=' + Object.keys(stockConfig).join(',');

  return new Promise(async (resolve, reject) => {
    let body: any;
    try {
      body = await httpRequest(url);
    } catch (e) {
      return reject(e instanceof Error ? e.message : String(e));
    }
    if (/FAILED/.test(body)) {
      return reject(`fail: error Stock code in ${Object.keys(stockConfig)}, please delete error Stock code`);
    }
    const splitData = body.split(';\n');
    const resultArr: Array<Stock> = [];
    for (let i = 0; i < splitData.length - 1; i++) {
      const code = splitData[i].split('="')[0].split('var hq_str_')[1];
      const params = splitData[i].split('="')[1].split(',');
      if (params.length > 1) {
        let StockConfig = stockConfig[code];
        if (!isArray(StockConfig)) { StockConfig = ['-', '-']; }
        if (StockConfig.length < 2) { StockConfig.concat(['-', '-']); }

        let resultStock: StockInfo | undefined;
        if (/^(sh|sz)/.test(code)) {
          resultStock = {
            name: params[0],
            code,
            lowWarn: formatPrice(StockConfig[0]),
            highWarn: formatPrice(StockConfig[1]),
            open: formatPrice(params[1]),
            lastClose: formatPrice(params[2]),
            highStop: formatPrice(params[2]* 1.1),
            lowStop: formatPrice(params[2]* 0.9),
            now: formatPrice(params[3]),
            high: formatPrice(params[4]),
            low: formatPrice(params[5]),
            volume: NumberCn(params[8], 2),
            amount: NumberCn(params[9], 2),
            changeAmount:'0',
            changeRate: '0',
            emoji: emojiConfig,
          };
        } else if (/^hk/.test(code)) {
          resultStock = {
            name: params[1],
            code,
            lowWarn: formatPrice(StockConfig[0]),
            highWarn: formatPrice(StockConfig[1]),
            open: formatPrice(params[2]),
            lastClose: formatPrice(params[3]),
            now: formatPrice(params[6]),
            high: formatPrice(params[4]),
            low: formatPrice(params[5]),
            volume: NumberCn(params[12], 2),
            amount: NumberCn(params[11], 2),
            changeAmount:'0',
            changeRate: '0',
            emoji: emojiConfig
          };
        } else if (/^gb_/.test(code)) {
          resultStock = {
            name: params[0],
            code,
            lowWarn: formatPrice(StockConfig[0]),
            highWarn: formatPrice(StockConfig[1]),
            open: formatPrice(params[5]),
            lastClose: formatPrice(params[26]),
            now: formatPrice(params[1]),
            high: formatPrice(params[6]),
            low: formatPrice(params[7]),
            volume: NumberCn(params[10], 2),
            changeAmount:'0',
            changeRate: '0',
            emoji: emojiConfig
          };
        }
        if (resultStock !== undefined) {
          const { lastClose, now, high, low } = resultStock;
          resultStock.changeAmount = ((+now - +lastClose) >= 0 ? '+' : '-') + formatPrice(Math.abs(+now - +lastClose), now),
          resultStock.changeRate = ((+now - +lastClose) >= 0 ? '+' : '-') + NumberCn((Math.abs(+now - +lastClose)) / +lastClose * 100, 2, false),
          resultStock.highRate = ((+high - +lastClose) >= 0 ? '+' : '-') + NumberCn((Math.abs(+high - +lastClose)) / +lastClose * 100, 2, false),
          resultStock.lowRate = ((+low - +lastClose) >= 0 ? '+' : '-') + NumberCn((Math.abs(+low - +lastClose)) / +lastClose * 100, 2, false),
          resultArr.push(new Stock(resultStock));
        }
      }// valid stock code
    }
    resolve(resultArr);
  });
}


export interface StockSuggest {
  name: string;   // 中文名称
  code: string;   // 行情接口可用的代码, 如 sh600519 / hk00700 / gb_aapl
  market: string; // 市场标签: A股 / 港股 / 美股
}

/**
 * 通过新浪 suggest 接口按 名称/拼音/拼音首字母/代码 搜索股票
 * 仅返回本插件行情接口支持的 沪深A股 / 港股 / 美股
 * @param keyword 关键词, 支持中文名、拼音、拼音首字母、代码、带市场前缀的代码
 */
export async function searchStock(keyword: string): Promise<Array<StockSuggest>> {
  const key = keyword.trim();
  if (!key) { return []; }
  const url = 'https://suggest3.sinajs.cn/suggest/type=&key=' + encodeURIComponent(key);
  let body: string;
  try {
    body = await httpRequest(url);
  } catch (e) {
    return [];
  }
  const match = body.match(/"([^"]*)"/);
  if (!match || !match[1]) { return []; }
  const results: Array<StockSuggest> = [];
  const seen: { [code: string]: boolean } = {};
  for (const item of match[1].split(';')) {
    const fields = item.split(',');
    if (fields.length < 5) { continue; }
    // fields[1]=类别 fields[2]=代码 fields[3]=带前缀代码 fields[4]=中文名
    const type = fields[1];
    const rawCode = fields[2];
    const symbol = fields[3];
    const name = fields[4] || fields[0];
    if (!rawCode || !name) { continue; }
    let code = '';
    let market = '';
    if (type === '11') {
      code = symbol;          // 已带 sh/sz 前缀
      market = 'A股';
    } else if (type === '31') {
      code = `hk${rawCode}`;  // 港股需补 hk 前缀
      market = '港股';
    } else if (type === '41') {
      code = `gb_${rawCode}`; // 美股需补 gb_ 前缀
      market = '美股';
    } else {
      continue;               // 基金/期货/暗盘等行情接口暂不支持, 直接跳过
    }
    if (seen[code]) { continue; }
    seen[code] = true;
    results.push({ name, code, market });
  }
  return results;
}

/**
 * 字符串长度拼接
 * @param source 原字符串长度
 * @param length 修改后的字符串长度
 * @param left 原字符串是否靠左边
 */
export function fillString(source: string, length: number, left = true): string {
  while (stringWidth(source) > length) {
    source = source.slice(0, source.length - 1);
  }
  const addString = ' '.repeat(length - stringWidth(source));
  if (left) {
    return source + addString;
  }
  return addString + source;
}

export interface StockInfo {
  name: string;
  code: string;
  lowWarn: string;
  highWarn: string;
  open: string;
  lastClose: string;
  now: string;
  high: string;
  low: string;
  volume: string; //成交量
  amount?: string; //成交额
  highStop?: string;
  lowStop?: string;
  changeAmount: string;
  changeRate: string;
  highRate?: string;
  lowRate?: string;
  emoji: string[];
}

/**
 * 价格格式化: 按数量级自适应小数位, 保证至少三位有效数字, 并保留末尾的 0
 * |num| >= 10 -> 2 位小数; >= 1 -> 3 位小数; < 1 -> 4 位小数
 * @param inputNumber 待格式化的数值
 * @param refNumber 决定小数位的参照值(默认取自身)。涨跌额传入现价, 使其小数位与价格一致
 * 非数字(如未设置的报警价 '-')返回 'NaN', 保持调用方 isNaN 判断不变
 */
export function formatPrice(inputNumber: any, refNumber?: any): string {
  const num = +inputNumber;
  if (isNaN(num)) { return 'NaN'; }
  const ref = refNumber === undefined ? num : +refNumber;
  const abs = Math.abs(isNaN(ref) ? num : ref);
  let digits = 4;
  if (abs >= 10) {
    digits = 2;
  } else if (abs >= 1) {
    digits = 3;
  }
  return num.toFixed(digits);
}

export function NumberCn(inputNumber: number = 0, fixNumber: number = 2, format = true): string {
  const num = +inputNumber;
  let newFixedNumber = fixNumber;
  if (format) {
    if (num > 1000 * 10000) {
      return +(num / (10000 * 10000)).toFixed(newFixedNumber) + '亿';
    } else if (num > 1000) {
      return +(num / 10000).toFixed(newFixedNumber) + '万';
    }
  }
  return +num.toFixed(newFixedNumber) + '';
}
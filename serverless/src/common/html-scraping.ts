import axios from 'axios';
import { isURL, normalizeURL } from './util';
import cheerio, { CheerioStatic } from 'cheerio';
import { uniq, concat, difference } from 'lodash';
import { phoneNumberRegExp, japanAddressRegExp, symbolList, urlComponentString } from './regexp-components';
const addressableUrl = require('url');

export async function analize(urlString: string) {
  const rootUrl = addressableUrl.parse(urlString);
  const $ = await loadAndParseHTMLfromCheerio(rootUrl.href);
  const trimedText = $.text().trim();
  const phoneNumbers = trimedText.match(phoneNumberRegExp('g'));
  const linkUrls = [];
  const mailAddresses = [];
  $('a').each((i, elem) => {
    const aTag = $(elem).attr() || {};
    // javascript:void(0) みたいなリンクは弾く
    // Jump系リンクも弾く
    if (aTag.href && !aTag.href.startsWith('javascript:') && !aTag.href.startsWith('#')) {
      const aUrl = addressableUrl.parse(normalizeURL(aTag.href, rootUrl.href));
      // 普通のリンク
      if (aUrl.protocol === 'http:' || aUrl.protocol === 'https:') {
        linkUrls.push(aUrl.href);
        // mailリンク
      } else if (aUrl.protocol === 'mailto:') {
        mailAddresses.push(aUrl.href.replace('mailto:', ''));
        // 電話番号のリンク
      } else if (aUrl.protocol === 'tel:') {
        phoneNumbers.push(aUrl.href.replace('tel:', ''));
        // link先が省略されている場合
      } else {
        const fullUrl = rootUrl.href + aUrl.href;
        linkUrls.push(fullUrl);
      }
    }
  });
  const addresses: string = [];
  const texts = trimedText.split(/\s/);
  const symbolRegExpList = symbolList.filter((symbol) => symbol != '\\-');
  const sanitizer = new RegExp(symbolRegExpList.join(''), 'g');
  for (const text of texts) {
    if (text.length > 0) {
      const regexp = japanAddressRegExp('g');
      const matchedAddresses = text.match(regexp);
      if (matchedAddresses && matchedAddresses.length > 0) {
        for (const matchedAddress of matchedAddresses) {
          addresses.push(matchedAddress.replace(sanitizer, ''));
        }
      }
    }
  }
  const cssUrls: string[] = [];
  const jsUrls: string[] = [];
  const allHTML = $.html();
  $('link').each((i, elem) => {
    const cssAttr = $(elem).attr() || {};
    if (cssAttr.href && cssAttr.href.length > 0 && cssAttr.href != rootUrl.href) {
      cssUrls.push(normalizeURL(cssAttr.href, rootUrl.href));
    }
  });
  const uniqCSSURLs = uniq(cssUrls);
  $('script').each((i, elem) => {
    const jsSrc = $(elem).attr() || {};
    if (jsSrc.src && jsSrc.src.length > 0 && jsSrc.href != rootUrl.href) {
      jsUrls.push(normalizeURL(jsSrc.src, rootUrl.href));
    }
  });
  const uniqJsUrls = uniq(jsUrls);
  const imageUrls: string[] = [];
  $('img').each((i, elem) => {
    const imgSrc = $(elem).attr() || {};
    if (imgSrc.src && imgSrc.src.length > 0 && imgSrc.src != rootUrl.href) {
      imageUrls.push(normalizeURL(imgSrc.src, rootUrl.href));
    }
  });
  imageUrls.push(...scrapeImageURL(allHTML));
  imageUrls.push(...scrapeCSSURL(allHTML, rootUrl.href));
  /*
  await Promise.all(
    concat(uniqCSSURLs, uniqJsUrls).map(async (textUrl) => {
      const subUrlImageUrls: string[] = [];
      const responseText = await loadText(textUrl);
      subUrlImageUrls.push(...scrapeImageURL(responseText));
      subUrlImageUrls.push(...scrapeCSSURL(responseText, textUrl));
      imageUrls.push(...subUrlImageUrls);
      return subUrlImageUrls;
    }),
  );
  */
  const videoUrls: string[] = [];
  $('video').each((i, elem) => {
    const videoSrc = $(elem).attr() || {};
    if (videoSrc.src && videoSrc.src.length > 0 && videoSrc.src != rootUrl.href) {
      videoUrls.push(normalizeURL(videoSrc.src, rootUrl.href));
    }
    $(elem)
      .find('source')
      .each((i, sourceElem) => {
        const videoSourceSrc = $(sourceElem).attr() || {};
        if (videoSourceSrc.src && videoSourceSrc.src.length > 0 && videoSourceSrc.src != rootUrl.href) {
          videoUrls.push(normalizeURL(videoSourceSrc.src, rootUrl.href));
        }
      });
  });

  const audioUrls: string[] = [];
  $('audio').each((i, elem) => {
    const audioSrc = $(elem).attr() || {};
    if (audioSrc.src && audioSrc.src.length > 0 && audioSrc.src != rootUrl.href) {
      audioUrls.push(normalizeURL(audioSrc.src, rootUrl.href));
    }
    $(elem)
      .find('source')
      .each((i, sourceElem) => {
        const audioSourceSrc = $(sourceElem).attr() || {};
        if (audioSourceSrc.src && audioSourceSrc.src.length > 0 && audioSourceSrc.src != rootUrl.href) {
          audioUrls.push(normalizeURL(audioSourceSrc.src, rootUrl.href));
        }
      });
  });

  const embedJsons = scrapeEmbedingJson(allHTML);

  return {
    infromations: {
      phoneNumbers: uniq(phoneNumbers),
      addresses: uniq(addresses),
      mailAddresses: uniq(mailAddresses),
    },
    resources: {
      linkUrls: uniq(linkUrls),
      cssUrls: uniqCSSURLs,
      jsUrls: uniqJsUrls,
      imageUrls: uniq(imageUrls),
      videoUrls: uniq(videoUrls),
      audioUrls: uniq(audioUrls),
    },
    embeds: {
      jsons: embedJsons,
    },
  };
}

function scrapeEmbedingJson(text: string): any[] {
  const parsedJsons: any[] = [];
  const jsonObjectRegexpString = '\\{.*\\:.*\\}';
  const jsonArrayRegexpString = '\\[.*\\]';
  const candidateJsonStrings = text.match(new RegExp('(' + [jsonObjectRegexpString, jsonArrayRegexpString].join('|') + ')', 'g'))
  for(const candidateJsonString of candidateJsonStrings){
    try {
      const json = JSON.parse(candidateJsonString);
      parsedJsons.push(json);
    } catch (error) {
      continue;
    }
  }
  return parsedJsons;
}

function scrapeCSSURL(text: string, rootUrl: string): string[] {
  const allBgUrls: string[] = [];
  const regexp = new RegExp('url(["\']?([' + urlComponentString + ']*)["\']?)', 'g');
  const bgCSSUrls = text.match(regexp) || [];
  for (const bgCSSUrl of bgCSSUrls) {
    const bgUrl = bgCSSUrl.replace(/(url\(|\)|")/g, '');
    if (bgUrl && bgUrl.length > 0 && bgUrl != rootUrl) {
      allBgUrls.push(normalizeURL(bgUrl, rootUrl));
    }
  }
  return allBgUrls;
}

function scrapeImageURL(text: string): string[] {
  const regexp = new RegExp('https?:\\/\\/[' + urlComponentString + ']+(jpg|jpeg|gif|png)', 'g');
  const imageUrls: string[] = text.match(regexp) || [];
  return imageUrls;
}

async function loadAndParseHTMLfromCheerio(url: string): CheerioStatic {
  const responseText = await loadText(url);
  return cheerio.load(responseText);
}

async function loadText(url: string): string {
  const response = await axios.get(url);
  if (typeof response.data === 'string') {
    return response.data.normalize('NFKC');
  }
  return JSON.stringify(response.data).normalize('NFKC');
}

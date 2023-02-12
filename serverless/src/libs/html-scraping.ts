import axios from 'axios';
import { normalizeURL } from './util';
import { load, CheerioAPI } from 'cheerio';
import { uniq, concat } from 'lodash';
import {
  phoneNumberRegExp,
  japanAddressRegExp,
  symbolList,
  urlComponentString,
  audioFileExtensions,
  videoFileExtensions,
  compressedFileExtensions,
  imageFileExtensions,
  pdfFileExtensions,
  threedModelFileExtensions,
  fontFileExtensions,
} from './regexp-components';
const addressableUrl = require('url');
const path = require('path');

export async function analize(urlString: string) {
  const rootUrl = addressableUrl.parse(urlString);
  const $ = await loadAndParseHTMLfromCheerio(rootUrl.href);
  const trimedText = $.text().trim();
  const phoneNumbers = trimedText.match(phoneNumberRegExp('g'));
  const orgLinkUrls = [];
  const mailAddresses = [];
  $('a').each((i, elem) => {
    const aTag = $(elem).attr() || {};
    // javascript:void(0) みたいなリンクは弾く
    // Jump系リンクも弾く
    if (aTag.href && !aTag.href.startsWith('javascript:') && !aTag.href.startsWith('#')) {
      const aUrl = addressableUrl.parse(normalizeURL(aTag.href, rootUrl.href));
      // 普通のリンク
      if (aUrl.protocol === 'http:' || aUrl.protocol === 'https:') {
        orgLinkUrls.push(aUrl.href);
        // mailリンク
      } else if (aUrl.protocol === 'mailto:') {
        mailAddresses.push(aUrl.href.replace('mailto:', ''));
        // 電話番号のリンク
      } else if (aUrl.protocol === 'tel:') {
        phoneNumbers.push(aUrl.href.replace('tel:', ''));
        // link先が省略されている場合
      } else {
        const fullUrl = rootUrl.href + aUrl.href;
        orgLinkUrls.push(fullUrl);
      }
    }
  });
  const addresses: string[] = [];
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
  $('script').each((i, elem) => {
    const jsSrc = $(elem).attr() || {};
    if (jsSrc.src && jsSrc.src.length > 0 && jsSrc.href != rootUrl.href) {
      jsUrls.push(normalizeURL(jsSrc.src, rootUrl.href));
    }
  });

  const uniqCSSURLs = uniq(cssUrls);
  const uniqJsUrls = uniq(jsUrls);

  // とりあえずAsset関係は全部この中に突っ込んでいくイメージ
  const assetFileUrls: string[] = [];

  // Assetじゃないリンク先のURLはこちらへ
  const linkUrls: string[] = [];
  // Assetファイルをそれぞれ振り分ける
  const imageUrls: string[] = [];
  const videoUrls: string[] = [];
  const audioUrls: string[] = [];
  const compressedFileUrls: string[] = [];
  const pdfFileUrls: string[] = [];
  const threedModelFileUrls: string[] = [];
  const fontFileUrls: string[] = [];
  const otherAssetFileUrls: string[] = [];

  $('img').each((i, elem) => {
    const imgSrc = $(elem).attr() || {};
    if (imgSrc.src && imgSrc.src.length > 0 && imgSrc.src != rootUrl.href) {
      imageUrls.push(normalizeURL(imgSrc.src, rootUrl.href));
    }
  });
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

  assetFileUrls.push(...scrapeAssetsURL(allHTML));
  assetFileUrls.push(...scrapeCSSURL(allHTML, rootUrl.href));
  await Promise.all(
    concat(uniqCSSURLs, uniqJsUrls).map(async (textUrl) => {
      const subAssetUrls: string[] = [];
      const responseText = await loadText(textUrl);
      subAssetUrls.push(...scrapeAssetsURL(responseText));
      subAssetUrls.push(...scrapeCSSURL(responseText, textUrl));
      assetFileUrls.push(...subAssetUrls);
      return subAssetUrls;
    }),
  );
  // assetFileを振り分ける
  for (const assetFileUrl of assetFileUrls) {
    const cleanFilePath = assetFileUrl.replace(/[?#].*/g, '');
    if (imageFileExtensions.includes(path.extname(cleanFilePath))) {
      imageUrls.push(assetFileUrl);
    } else if (videoFileExtensions.includes(path.extname(cleanFilePath))) {
      videoUrls.push(assetFileUrl);
    } else if (audioFileExtensions.includes(path.extname(cleanFilePath))) {
      audioUrls.push(assetFileUrl);
    } else if (compressedFileExtensions.includes(path.extname(cleanFilePath))) {
      compressedFileUrls.push(assetFileUrl);
    } else if (pdfFileExtensions.includes(path.extname(cleanFilePath))) {
      pdfFileUrls.push(assetFileUrl);
    } else if (threedModelFileExtensions.includes(path.extname(cleanFilePath))) {
      threedModelFileUrls.push(assetFileUrl);
    } else if (fontFileExtensions.includes(path.extname(cleanFilePath))) {
      fontFileUrls.push(assetFileUrl);
    } else {
      otherAssetFileUrls.push(assetFileUrl);
    }
  }

  for (const orgLinkUrl of orgLinkUrls) {
    const cleanFilePath = orgLinkUrl.replace(/[?#].*/g, '');
    if (imageFileExtensions.includes(path.extname(cleanFilePath))) {
      imageUrls.push(orgLinkUrl);
    } else if (videoFileExtensions.includes(path.extname(cleanFilePath))) {
      videoUrls.push(orgLinkUrl);
    } else if (audioFileExtensions.includes(path.extname(cleanFilePath))) {
      audioUrls.push(orgLinkUrl);
    } else if (compressedFileExtensions.includes(path.extname(cleanFilePath))) {
      compressedFileUrls.push(orgLinkUrl);
    } else if (pdfFileExtensions.includes(path.extname(cleanFilePath))) {
      pdfFileUrls.push(orgLinkUrl);
    } else if (threedModelFileExtensions.includes(path.extname(cleanFilePath))) {
      threedModelFileUrls.push(orgLinkUrl);
    } else if (fontFileExtensions.includes(path.extname(cleanFilePath))) {
      fontFileUrls.push(orgLinkUrl);
    } else {
      linkUrls.push(orgLinkUrl);
    }
  }

  const embedJsons = scrapeEmbedingJson(allHTML);

  return {
    infromations: {
      phoneNumbers: uniq(phoneNumbers),
      addresses: uniq(addresses),
      mailAddresses: uniq(mailAddresses),
    },
    assets: {
      linkUrls: uniq(linkUrls),
      cssUrls: uniqCSSURLs,
      jsUrls: uniqJsUrls,
      imageUrls: uniq(imageUrls),
      videoUrls: uniq(videoUrls),
      audioUrls: uniq(audioUrls),
      compressedFileUrls: uniq(compressedFileUrls),
      pdfFileUrls: uniq(pdfFileUrls),
      threedModelFileUrls: uniq(threedModelFileUrls),
      fontFileUrls: uniq(fontFileUrls),
      otherAssetFileUrls: uniq(otherAssetFileUrls),
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
  const candidateJsonStrings = text.match(new RegExp('(' + [jsonObjectRegexpString, jsonArrayRegexpString].join('|') + ')', 'g'));
  for (const candidateJsonString of candidateJsonStrings) {
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
  const regexp = new RegExp('url\\(["\']?([' + urlComponentString + ']*)["\']?\\)', 'g');
  const bgCSSUrls = text.match(regexp) || [];
  for (const bgCSSUrl of bgCSSUrls) {
    const bgUrl = bgCSSUrl.replace(/(url\(|\)|"|')/g, '').replace(/;$/g, '');
    if (bgUrl && bgUrl.length > 0 && bgUrl != rootUrl) {
      allBgUrls.push(normalizeURL(bgUrl, rootUrl));
    }
  }
  return allBgUrls;
}

function scrapeAssetsURL(text: string): string[] {
  const assetFileExtentions = [
    ...audioFileExtensions,
    ...videoFileExtensions,
    ...compressedFileExtensions,
    ...imageFileExtensions,
    ...pdfFileExtensions,
    ...threedModelFileExtensions,
    ...fontFileExtensions,
  ].map((ext) => {
    // .は全て抜く
    return ext.substr(1);
  });

  const regexp = new RegExp('https?:\\/\\/[' + urlComponentString + ']+\\.(' + uniq(assetFileExtentions).join('|') + ')', 'g');
  const assetUrls: string[] = text.match(regexp) || [];
  return assetUrls;
}

async function loadAndParseHTMLfromCheerio(url: string): Promise<CheerioAPI> {
  const responseText = await loadText(url);
  return load(responseText);
}

async function loadText(url: string): Promise<string> {
  const response = await axios.get(url);
  if (typeof response.data === 'string') {
    return response.data.normalize('NFKC');
  }
  return JSON.stringify(response.data).normalize('NFKC');
}

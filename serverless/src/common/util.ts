import { urlRegExp } from './regexp-components';
const addressableUrl = require('url');
const path = require('path');

export function isURL(str: string): boolean {
  const pattern = urlRegExp('i');
  return pattern.test(str);
}

export function normalizeURL(srcURLString: string, orgURLString: string): string {
  const aUrl = addressableUrl.parse(srcURLString);
  if (!aUrl.protocol) {
    const rootUrl = addressableUrl.parse(orgURLString);
    let fullUrl = '';
    if (aUrl.href.startsWith('//')) {
      fullUrl = rootUrl.protocol + aUrl.href;
    } else if (aUrl.href.startsWith('/')) {
      fullUrl = rootUrl.protocol + '//' + rootUrl.host + aUrl.href;
    } else if (aUrl.href.startsWith('./')) {
      fullUrl = path.dirname(rootUrl.href) + '/' + aUrl.href.replace('./', '');
    } else if (aUrl.href.startsWith('../')) {
      fullUrl = path.dirname(path.dirname(rootUrl.href)) + '/' + aUrl.href.replace('../', '');
    } else {
      fullUrl = path.dirname(rootUrl.href) + '/' + aUrl.href;
    }
    return fullUrl;
  } else {
    return aUrl.href;
  }
}

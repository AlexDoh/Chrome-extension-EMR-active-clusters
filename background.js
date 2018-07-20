const getLocation = (href) => {
  const match = href.match(/^(https?\:)\/\/(([^:\/?#]*)(?:\:([0-9]+))?)(\/[^?#]*)(\?[^#]*|)(#.*|)$/);
  return match && {
    protocol: match[ 1 ],
    host: match[ 2 ],
    hostname: match[ 3 ],
    port: match[ 4 ],
    pathname: match[ 5 ],
    search: match[ 6 ],
    hash: match[ 7 ]
  }
};

const getDigits = (str) => {
  const match = str.match(/([0-9]+)/);
  return match && match[ 1 ]
};

chrome.webRequest.onBeforeRequest.addListener((details) => {
    const url = getLocation(details.url);
    const host = url.host.split("-");
    const ip = getDigits(host[ 1 ]) + "." + getDigits(host[ 2 ]) + "." + getDigits(host[ 3 ]) + "." + getDigits(host[ 4 ]);
    return { redirectUrl: details.url.replace(url.hostname, ip) };
  },
  {
    urls: [
      "http://*.compute.internal:*/*",
    ],
    types: [ "main_frame", "sub_frame", "stylesheet", "script", "image", "object", "xmlhttprequest", "other" ]
  },
  [ "blocking" ]
);

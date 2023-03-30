const querystring = require("querystring");
const cookie_parser = require("cookie");
const axios = require("axios");
const url = require("url");
const dotenv = require("dotenv").config();

const HOST = "login.live.com";
const XboxLiveSubdomain = {
  PROFILE: "profile.xboxlive.com",
  SOCIAL: "social.xboxlive.com",
  CLIPS: "gameclipsmetadata.xboxlive.com",
  SCREEN_SHOT: "screenshotsmetadata.xboxlive.com",
  ACHIVEMENTS: "achievements.xboxlive.com",
  AVTY: "avty.xboxlive.com",
  USERPRECENSE: "userpresence.xboxlive.com",
};

const parseCookies = (cookies) => {
  return cookies.reduce((accumulator, cookie, index) => {
    const aCookie = cookie_parser.parse(cookie);
    const [[firstKey, firstValue]] = Object.entries(aCookie);
    accumulator += `${firstKey}=${firstValue}`;

    const isNotLast = index < cookies.length - 1;
    if (isNotLast) {
      accumulator += "; ";
    }
    return accumulator;
  }, "");
};

const extractUrlPostAndPpftRe = (payload) => {
  const urlPost =
    payload.match(/urlPost:'([A-Za-z0-9:\?_\-\.&\\/=]+)/)?.[1] ?? "";
  const ppftRe = payload.match(/sFTTag:'.*value=\"(.*)\"\/>'/)?.[1] ?? "";
  return { urlPost, ppftRe };
};

const fetchPreAuthData = async () => {
  const postValues = {
    client_id: "0000000048093EE3",
    redirect_uri: `https://${HOST}/oauth20_desktop.srf`,
    response_type: "token",
    display: "touch",
    scope: "service::user.auth.xboxlive.com::MBI_SSL",
    locale: "en",
  };
  const postValuesQueryParams = unescape(querystring.stringify(postValues));
  const options = { headers: { Host: HOST } };
  const xruReq = await fetch(
    `https://${HOST}/oauth20_authorize.srf?${postValuesQueryParams}`,
    options
  );
  const { headers } = xruReq;
  const payload = await xruReq.text();
  const { urlPost, ppftRe } = extractUrlPostAndPpftRe(payload);
  const cookies = headers.get("set-cookie")?.split(", ") ?? [];
  const stringifiedCookies = parseCookies(cookies);
  return { url_post: urlPost, ppft_re: ppftRe, cookies: stringifiedCookies };
};

const generatePostValues = (ppftRe) => {
  return {
    login: process.env.XBL_USERNAME,
    passwd: process.env.XBL_PASSWORD,
    PPFT: ppftRe,
    PPSX: "Passpor",
    SI: "Sign In",
    type: "11",
    NewUser: "1",
    LoginOptions: "1",
    i3: "36728",
    m1: "768",
    m2: "1184",
    m3: "0",
    i12: "1",
    i17: "0",
    i18: "__Login_Host|1",
  };
};

const fetchInitialAccessToken = async (options) => {
  const { ppft_re: ppftRe, url_post: urlPost, cookies } = options;
  const postValues = generatePostValues(ppftRe);
  // eslint-disable-next-line n/no-deprecated-api
  const { path } = url.parse(urlPost);
  if (!path) {
    throw new Error("No path found on query params");
  }
  // TODO: figure out how to make this request work with axios
  const accessTokenResponse = await fetch(`https://${HOST}${path}`, {
    method: "POST",
    body: querystring.stringify(postValues),
    headers: {
      Cookie: cookies,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  if ([302, 200].includes(accessTokenResponse.status)) {
    const accessToken =
      accessTokenResponse.url?.match(/access_token=(.+?)&/)?.[1];
    if (!accessToken) {
      throw new Error("Could not get find location header");
    }
    return { cookies, accessToken };
  } else {
    throw new Error("Could not get access token");
  }
};

const authenticate = async (options) => {
  const { cookies, accessToken } = options;
  const payload = {
    RelyingParty: "http://auth.xboxlive.com",
    TokenType: "JWT",
    Properties: {
      AuthMethod: "RPS",
      SiteName: "user.auth.xboxlive.com",
      RpsTicket: accessToken,
    },
  };
  const requestOptions = {
    headers: {
      Cookie: cookies,
    },
  };
  const { data } = await axios.post(
    "https://user.auth.xboxlive.com/user/authenticate",
    payload,
    requestOptions
  );
  const notAfter = data.NotAfter;
  const token = data.Token;
  const userHash = data.DisplayClaims.xui[0].uhs;
  return { token, uhs: userHash, notAfter, cookies };
};

const authorize = async (options) => {
  let { token, uhs, notAfter, cookies } = options;
  const payload = {
    RelyingParty: "http://xboxlive.com",
    TokenType: "JWT",
    Properties: { UserTokens: [token], SandboxId: "RETAIL" },
  };
  const requestOptions = { headers: { Cookie: cookies } };
  const { data } = await axios.post(
    "https://xsts.auth.xboxlive.com/xsts/authorize",
    payload,
    requestOptions
  );
  uhs = data.DisplayClaims.xui[0].uhs;
  notAfter = data.NotAfter;
  token = data.Token;
  const authorizationHeader = `XBL3.0 x=${uhs};${token}`;
  return { cookies, authorizationHeader };
};

const fetchCookiesAndAuthorizationDetails = async () => {
  const resultOne = await fetchPreAuthData();
  const initialAccessToken = await fetchInitialAccessToken(resultOne);
  const authenticationResult = await authenticate(initialAccessToken);
  const authorizationResult = await authorize(authenticationResult);
  return authorizationResult;
};

const makeXboxLiveRequest = async (host, uri, settings = {}) => {
  let { type, body } = settings;
  if (!type) type = "GET";
  const useragent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.113 Safari/537.36";
  const { cookies, authorizationHeader } =
    await fetchCookiesAndAuthorizationDetails();
  const requestOptions = {
    headers: {
      Cookie: cookies,
      "Content-Type": "application/json",
      "x-xbl-contract-version": "2",
      "User-Agent": `${useragent} Like SmartGlass/2.105.0415 CFNetwork/711.3.18 Darwin/14.0.0`,
      Authorization: authorizationHeader,
    },
  };
  try {
    let res;
    if (type === "GET")
      res = await axios.get(`https://${host}${uri}`, requestOptions);
    if (type === "POST")
      res = await axios.post(`https://${host}${uri}`, body, requestOptions);
    const { data } = res;
    return data;
  } catch (error) {
    if (error.status === 429) {
      throw new Error("Rate limit");
    }
    if (error.status === 404) {
      throw new Error("Player not found");
    }
    throw error;
  }
};

async function getXuid(gamertag) {
  const host = XboxLiveSubdomain.PROFILE;
  const uri = `/users/gt(${gamertag})/profile/settings`;
  const data = await makeXboxLiveRequest(host, uri);
  if (!data.profileUsers?.length) {
    data.profileUsers = [mockUserData];
    throw new Error(`Could not find ${gamertag} in Xbox Live API`);
  }
  return data.profileUsers[0].id;
}

async function getProfile(gamertag) {
  const host = XboxLiveSubdomain.PROFILE;
  const xuid = await getXuid(gamertag);
  const uri = `/users/batch/profile/settings`;
  const data = await makeXboxLiveRequest(host, uri, {
    type: "POST",
    body: {
      userIds: [xuid],
      settings: [
        "GameDisplayName",
        "GameDisplayPicRaw",
        "Gamerscore",
        "Gamertag",
        "AccountTier",
        "TenureLevel",
      ],
    },
  });
  data.profileUsers[0].settings.push({ id: "xuid", value: xuid });
  return data.profileUsers[0].settings;
}
async function getFriends(xuid) {
  const host = XboxLiveSubdomain.SOCIAL;
  const uri = `/users/xuid(${xuid})/summary`;
  const data = await makeXboxLiveRequest(host, uri);
  return data;
}
async function getUserPrecense(xuid) {
  const host = XboxLiveSubdomain.USERPRECENSE;
  const uri = `/users/xuid(${xuid})`;
  const data = await makeXboxLiveRequest(host, uri);
  return data;
}

module.exports = {
  getProfile,
  getFriends,
  getUserPrecense,
};

import axios from 'axios';

const PROD_ORIGIN = 'https://inventory.snabbb.com';

const applink = async (param: any) => {
  try {
    const { data } = await axios.post(
      `${PROD_ORIGIN}/api/v1/sso/app_link`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          app_code: 'inventory',
          email: param.username,
          name: param.name,
          company_id: 2,
          portal: true,
        },
        id: 1,
      }
    );

    const resultUrl = data?.result?.url;

    if (!resultUrl) {
      throw new Error(
        'SSO redirection URL was not returned'
      );
    }

    const currentOrigin = window.location.origin;
    const isProduction =
      currentOrigin === PROD_ORIGIN;

    const targetUrl = new URL(
      resultUrl,
      PROD_ORIGIN
    );

    console.log('[SSO] Current origin:', currentOrigin);
    console.log('[SSO] Backend URL:', resultUrl);

    if (!isProduction) {
      targetUrl.protocol =
        window.location.protocol;

      targetUrl.host =
        window.location.host;
    }

    console.log(
      '[SSO] Final redirect:',
      targetUrl.toString()
    );

    window.location.assign(
      targetUrl.toString()
    );

    return data;
  } catch (err: any) {
    console.error(
      '[SSO] Redirection error:',
      err
    );

    throw new Error(
      err?.message ||
      'SSO redirection failed'
    );
  }
};

export default applink;
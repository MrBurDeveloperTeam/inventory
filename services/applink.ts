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

    const targetUrl = new URL(
      resultUrl,
      PROD_ORIGIN
    );

    const currentOrigin =
      window.location.origin;

    const isProduction =
      currentOrigin === PROD_ORIGIN;

    /*
     * Production:
     * inventory.snabbb.com
     * -> inventory.snabbb.com
     *
     * Preview:
     * current preview origin
     * -> current preview origin
     *
     * Keep the SSO path and query string
     * returned by the backend.
     */
    if (
      !isProduction &&
      targetUrl.origin === PROD_ORIGIN
    ) {
      targetUrl.protocol =
        window.location.protocol;

      targetUrl.host =
        window.location.host;
    }

    window.location.assign(
      targetUrl.toString()
    );

    return data;
  } catch (err: any) {
    console.error(
      'Redirection error:',
      err
    );

    throw new Error(
      err?.message ||
      'SSO redirection failed'
    );
  }
};

export default applink;
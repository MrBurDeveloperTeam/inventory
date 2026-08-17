export const getActiveCompanyFromOdooSession = () => {
  try {
    const raw = localStorage.getItem("odoo_session");
    if (!raw) return null;

    const session = JSON.parse(raw);
    const companyCodes = session?.company_codes || {};

    // Try the most likely current company fields first
    const currentCompanyId =
      session?.user_companies?.current_company?.[0] ||
      session?.user_companies?.current_company ||
      session?.company_id ||
      session?.current_company ||
      null;

    console.log('the company code: ', companyCodes[currentCompanyId]);

    if (currentCompanyId && companyCodes[currentCompanyId]) {
      return {
        companyId: String(currentCompanyId),
        companyCode: String(companyCodes[currentCompanyId]).toUpperCase(),
      };
    }

    // fallback only if current company is unavailable
    const entries = Object.entries(companyCodes);
    if (!entries.length) return null;

    const [companyId, companyCode] = entries[0];
    return {
      companyId: String(companyId),
      companyCode: String(companyCode).toUpperCase(),
    };
  } catch (e) {
    console.error("Failed to parse odoo_session:", e);
    return null;
  }
}
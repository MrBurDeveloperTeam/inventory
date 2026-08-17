import { useMutation } from "@tanstack/react-query";
import { api } from "../services/api";
import { getActiveCompanyFromOdooSession } from "@/services/getCompanies";

export const useCreateAppLink = () => {
  return useMutation({
    mutationFn: async ({
      app,
      email,
      name,
    }: {
      app: string;
      email: string;
      name: string;
    }) => {
      const company = getActiveCompanyFromOdooSession();
      console.log('the company info is', company);

      const { data } = await api.post(
        "/v1/sso/app_link",
        {
          jsonrpc: "2.0",
          method: "call",
          params: {
            app_code: app,
            email,
            name,
            company_id: company?.companyId ? Number(company.companyId) : 2,
            portal: true,
          },
          id: 1,
        },
        {
          headers: {
            ...(company?.companyCode ? { "X-Company-Code": company.companyCode } : {}),
            ...(company?.companyId ? { "X-Company-Id": company.companyId } : {}),
          },
          withCredentials: true,
        }
      );

      return data;
    },
  });
};
export interface AuthFormData {
  fullName: string;
  jobPosition: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
  agreedToTerms: boolean;
  country: string;
  dob?: string;
  partner_id: number;
}
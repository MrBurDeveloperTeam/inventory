import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { User, Building2, ChevronDown, Mail, Phone, BriefcaseBusiness, Globe2, ShieldCheck } from 'lucide-react';
import { UserProfile } from './types';
import { api } from './services/api';
import { loginOdoo } from './services/LoginOdoo';
import applink from './services/applink';
import { DENTAL_POSITIONS } from './constants/dentalPositions';
import { DOBPicker } from './components/DOBPicker';

interface LandingModalProps {
  onLogin: (user: UserProfile) => void;
}

const LandingModal: React.FC<LandingModalProps> = ({ onLogin }) => {
  const [view, setView] = useState<'signup' | 'login'>('signup');
  const [accountType, setAccountType] = useState<'individual' | 'company'>('individual');

  // Form states
  const [rememberMe, setRememberMe] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [position, setPosition] = useState('');
  const [customJobPosition, setCustomJobPosition] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [dob, setDob] = useState('');
  const [country, setCountry] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Password states (FIX: no hardcoded passwords)
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // UX states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const inputClass =
    'w-full bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-2.5 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-tiffany-600/20 focus:border-tiffany-600 transition-all text-sm';
  const labelClass = 'block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-1.5 ml-1';
  const fieldIconClass = 'absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 pointer-events-none';

  const resetAuthFields = () => {
    setPassword('');
    setConfirmPassword('');
    setErrorMsg(null);
  };

  // Clear sensitive fields when switching views
  useEffect(() => {
    resetAuthFields();
  }, [view, accountType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      if (!email.trim()) {
        setErrorMsg('Please enter your email.');
        return;
      }
      if (!password) {
        setErrorMsg('Please enter your password.');
        return;
      }

      if (view === 'signup') {
        const effectivePosition = position === 'OTHER'
          ? customJobPosition.trim()
          : position;

        if (password !== confirmPassword) {
          setErrorMsg('Passwords do not match.');
          return;
        }
        if (!name.trim() || !phone.trim() || !effectivePosition || !dob || !country) {
          setErrorMsg('Please complete all required fields.');
          return;
        }

        if (accountType === 'company' && !companyName.trim()) {
          setErrorMsg('Please enter your company name.');
          return;
        }

        if (!agreedToTerms) {
          setErrorMsg('You must agree to the Terms of Service, Privacy Policy and Disclaimer.');
          return;
        }
        const payload = {
          email: email.trim(),
          password,
          options: {
            data: {
              name: name.trim(),
              account_type: accountType,
              phone: phone.trim(),
              position: effectivePosition,
              dob,
              country,
              agreed_to_terms: agreedToTerms,
              company_name: accountType === 'company' ? companyName.trim() : null,
            },
          },
        };
        const { data: odooData } = await api.post('/inventory/sign-up', payload);
        console.log('ODoo sign-up response:', odooData);

        const {data, error } = odooData.data.result.ok && await supabase.auth.signUp(payload);

          setErrorMsg('Sign up successful. Please check your email to confirm your account.');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        
        if (error) {
          const { data } =  await loginOdoo(email, password); 
          data && data?.result && data.result?.uid
          if (data && data.result && data.result.uid) {
            const applinkData = await applink(data.result);
            console.log('Applink response:', applinkData);
          }
          return data;
        };

        if (data.user) {
          const inferredAccountType = (data.user.user_metadata?.account_type as any) || (email.trim().toLowerCase() === 'admin123@gmail.com' ? 'admin' : 'individual');
          const profile: UserProfile = {
            name: data.user.user_metadata?.name || data.user.email || 'User',
            email: data.user.email || email.trim(),
            accountType: inferredAccountType,
            phone: data.user.user_metadata?.phone || '',
            position: data.user.user_metadata?.position || '',
            companyName: data.user.user_metadata?.company_name,
          };
          onLogin(profile);
        }
      }
    } catch (err) {
      console.error('Auth error', err);
      setErrorMsg((err as Error).message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-6 sm:px-6 sm:py-10">
        <div className="w-full max-w-[420px] min-h-0 bg-white border border-slate-200 rounded-[1.5rem] shadow-2xl p-6 sm:max-w-xl sm:p-8 lg:max-w-2xl lg:p-10 flex flex-col justify-center">        
          {view === 'signup' ? (
          <div className="flex flex-col gap-4">
            <header className="mb-3">
              <h1 className="text-3xl font-black text-slate-900 mb-2 tracking-tighter">Create Account</h1>
              <p className="text-slate-500 font-semibold text-sm leading-relaxed">Track and manage your dental inventory with ease.</p>
            </header>

            <label className={labelClass}>Account Type</label>

            {/* Account Type Toggle */}
            <div className="grid grid-cols-2 rounded-xl border border-slate-200 overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => setAccountType('individual')}
                className={`flex items-center justify-center gap-2 py-3 font-bold text-sm transition-all ${
                  accountType === 'individual'
                    ? 'bg-tiffany-600 text-white'
                    : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                <User className="w-3.5 h-3.5" /> Individual
              </button>
              <button
                type="button"
                onClick={() => setAccountType('company')}
                className={`flex items-center justify-center gap-2 py-3 font-bold text-sm transition-all ${
                  accountType === 'company'
                    ? 'bg-tiffany-600 text-white'
                    : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" /> Company
              </button>
            </div>

            {!!errorMsg && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              {accountType === 'individual' ? (
                <>
                  <div>
                    <label className={labelClass}>Your Name</label>
                    <div className="relative"><User className={fieldIconClass} /><input type="text" className={inputClass} placeholder="e.g. Nour AYACHE" value={name} onChange={(e) => setName(e.target.value)} required /></div>
                  </div>
                  <div>
                    <label className={labelClass}>Your Email</label>
                    <div className="relative"><Mail className={fieldIconClass} /><input type="email" className={inputClass} placeholder="e.g. nur@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
                    <p className="text-[10px] text-slate-400 mt-0.5">This will be your login email</p>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className={labelClass}>Company Name</label>
                    <div className="relative"><Building2 className={fieldIconClass} /><input type="text" className={inputClass} placeholder="e.g. DENTA TECH" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required /></div>
                  </div>
                  <div>
                    <label className={labelClass}>Company Email</label>
                    <div className="relative"><Mail className={fieldIconClass} /><input type="email" className={inputClass} placeholder="e.g. hello@denta.tech" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
                  </div>
                  <div>
                    <label className={labelClass}>Name</label>
                    <div className="relative"><User className={fieldIconClass} /><input type="text" className={inputClass} placeholder="Contact Name" value={name} onChange={(e) => setName(e.target.value)} required /></div>
                  </div>
                </>
              )}

              <div>
                <label className={labelClass}>{accountType === 'individual' ? 'Phone (WhatsApp)' : 'Phone'}</label>
                <div className="relative"><Phone className={fieldIconClass} /><input type="tel" className={inputClass} placeholder="e.g. +60123456789" value={phone} onChange={(e) => setPhone(e.target.value)} required /></div>
              </div>

              <div>
                <label className={labelClass}>Date of Birth</label>
                <DOBPicker value={dob} onChange={setDob} />
                {accountType === 'company' && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Date of birth of the company representative.
                  </p>
                )}
              </div>

              <div>
                <label className={labelClass}>Job Position</label>
                <div className="relative">
                  <BriefcaseBusiness className={fieldIconClass} />
                  <select
                    className={`${inputClass} appearance-none pr-8 font-bold`}
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    required
                  >
                    <option value="">-- Select Position --</option>
                    {DENTAL_POSITIONS.map((jobPosition) => (
                      <option key={jobPosition} value={jobPosition}>{jobPosition}</option>
                    ))}
                    <option value="OTHER">Other</option>
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300 pointer-events-none" />
                </div>
              </div>

              {position === 'OTHER' && (
                <div>
                  <label className={labelClass}>Specify Position</label>
                  <div className="relative">
                    <BriefcaseBusiness className={fieldIconClass} />
                    <input
                      type="text"
                      className={inputClass}
                      placeholder="e.g. Clinic Manager"
                      value={customJobPosition}
                      onChange={(e) => setCustomJobPosition(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              <div>
                <label className={labelClass}>Country</label>
                <div className="relative">
                  <Globe2 className={fieldIconClass} />
                  <select
                    className={`${inputClass} pr-10 font-bold`}
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    required
                  >
                  <option value="">-- Select Country --</option>
                  <option value="3">Afghanistan</option>
                  <option value="6">Albania</option>
                  <option value="62">Algeria</option>
                  <option value="11">American Samoa</option>
                  <option value="1">Andorra</option>
                  <option value="8">Angola</option>
                  <option value="5">Anguilla</option>
                  <option value="9">Antarctica</option>
                  <option value="4">Antigua and Barbuda</option>
                  <option value="10">Argentina</option>
                  <option value="7">Armenia</option>
                  <option value="14">Aruba</option>
                  <option value="13">Australia</option>
                  <option value="12">Austria</option>
                  <option value="16">Azerbaijan</option>
                  <option value="32">Bahamas</option>
                  <option value="23">Bahrain</option>
                  <option value="19">Bangladesh</option>
                  <option value="18">Barbados</option>
                  <option value="36">Belarus</option>
                  <option value="20">Belgium</option>
                  <option value="37">Belize</option>
                  <option value="25">Benin</option>
                  <option value="27">Bermuda</option>
                  <option value="33">Bhutan</option>
                  <option value="29">Bolivia</option>
                  <option value="30">Bonaire, Sint Eustatius and Saba</option>
                  <option value="17">Bosnia and Herzegovina</option>
                  <option value="35">Botswana</option>
                  <option value="34">Bouvet Island</option>
                  <option value="31">Brazil</option>
                  <option value="105">British Indian Ocean Territory</option>
                  <option value="28">Brunei Darussalam</option>
                  <option value="22">Bulgaria</option>
                  <option value="21">Burkina Faso</option>
                  <option value="24">Burundi</option>
                  <option value="116">Cambodia</option>
                  <option value="47">Cameroon</option>
                  <option value="38">Canada</option>
                  <option value="52">Cape Verde</option>
                  <option value="123">Cayman Islands</option>
                  <option value="40">Central African Republic</option>
                  <option value="214">Chad</option>
                  <option value="46">Chile</option>
                  <option value="48">China</option>
                  <option value="54">Christmas Island</option>
                  <option value="39">Cocos (Keeling) Islands</option>
                  <option value="49">Colombia</option>
                  <option value="118">Comoros</option>
                  <option value="42">Congo</option>
                  <option value="45">Cook Islands</option>
                  <option value="50">Costa Rica</option>
                  <option value="97">Croatia</option>
                  <option value="51">Cuba</option>
                  <option value="53">Curaçao</option>
                  <option value="55">Cyprus</option>
                  <option value="56">Czech Republic</option>
                  <option value="44">Côte d'Ivoire</option>
                  <option value="41">Democratic Republic of the Congo</option>
                  <option value="59">Denmark</option>
                  <option value="58">Djibouti</option>
                  <option value="60">Dominica</option>
                  <option value="61">Dominican Republic</option>
                  <option value="63">Ecuador</option>
                  <option value="65">Egypt</option>
                  <option value="209">El Salvador</option>
                  <option value="87">Equatorial Guinea</option>
                  <option value="67">Eritrea</option>
                  <option value="64">Estonia</option>
                  <option value="212">Eswatini</option>
                  <option value="69">Ethiopia</option>
                  <option value="72">Falkland Islands</option>
                  <option value="74">Faroe Islands</option>
                  <option value="71">Fiji</option>
                  <option value="70">Finland</option>
                  <option value="75">France</option>
                  <option value="79">French Guiana</option>
                  <option value="174">French Polynesia</option>
                  <option value="215">French Southern Territories</option>
                  <option value="76">Gabon</option>
                  <option value="84">Gambia</option>
                  <option value="78">Georgia</option>
                  <option value="57">Germany</option>
                  <option value="80">Ghana</option>
                  <option value="81">Gibraltar</option>
                  <option value="88">Greece</option>
                  <option value="83">Greenland</option>
                  <option value="77">Grenada</option>
                  <option value="86">Guadeloupe</option>
                  <option value="91">Guam</option>
                  <option value="90">Guatemala</option>
                  <option value="82">Guernsey</option>
                  <option value="85">Guinea</option>
                  <option value="92">Guinea-Bissau</option>
                  <option value="93">Guyana</option>
                  <option value="98">Haiti</option>
                  <option value="95">Heard Island and McDonald Islands</option>
                  <option value="236">Holy See (Vatican City State)</option>
                  <option value="96">Honduras</option>
                  <option value="94">Hong Kong</option>
                  <option value="99">Hungary</option>
                  <option value="108">Iceland</option>
                  <option value="104">India</option>
                  <option value="100">Indonesia</option>
                  <option value="107">Iran</option>
                  <option value="106">Iraq</option>
                  <option value="101">Ireland</option>
                  <option value="103">Isle of Man</option>
                  <option value="102">Israel</option>
                  <option value="109">Italy</option>
                  <option value="111">Jamaica</option>
                  <option value="113">Japan</option>
                  <option value="110">Jersey</option>
                  <option value="112">Jordan</option>
                  <option value="124">Kazakhstan</option>
                  <option value="114">Kenya</option>
                  <option value="117">Kiribati</option>
                  <option value="250">Kosovo</option>
                  <option value="122">Kuwait</option>
                  <option value="115">Kyrgyzstan</option>
                  <option value="125">Laos</option>
                  <option value="134">Latvia</option>
                  <option value="126">Lebanon</option>
                  <option value="131">Lesotho</option>
                  <option value="130">Liberia</option>
                  <option value="135">Libya</option>
                  <option value="128">Liechtenstein</option>
                  <option value="132">Lithuania</option>
                  <option value="133">Luxembourg</option>
                  <option value="147">Macau</option>
                  <option value="141">Madagascar</option>
                  <option value="155">Malawi</option>
                  <option value="157">Malaysia</option>
                  <option value="154">Maldives</option>
                  <option value="144">Mali</option>
                  <option value="152">Malta</option>
                  <option value="142">Marshall Islands</option>
                  <option value="149">Martinique</option>
                  <option value="150">Mauritania</option>
                  <option value="153">Mauritius</option>
                  <option value="246">Mayotte</option>
                  <option value="156">Mexico</option>
                  <option value="73">Micronesia</option>
                  <option value="138">Moldova</option>
                  <option value="137">Monaco</option>
                  <option value="146">Mongolia</option>
                  <option value="139">Montenegro</option>
                  <option value="151">Montserrat</option>
                  <option value="136">Morocco</option>
                  <option value="158">Mozambique</option>
                  <option value="145">Myanmar</option>
                  <option value="159">Namibia</option>
                  <option value="168">Nauru</option>
                  <option value="167">Nepal</option>
                  <option value="165">Netherlands</option>
                  <option value="160">New Caledonia</option>
                  <option value="170">New Zealand</option>
                  <option value="164">Nicaragua</option>
                  <option value="161">Niger</option>
                  <option value="163">Nigeria</option>
                  <option value="169">Niue</option>
                  <option value="162">Norfolk Island</option>
                  <option value="120">North Korea</option>
                  <option value="143">North Macedonia</option>
                  <option value="148">Northern Mariana Islands</option>
                  <option value="166">Norway</option>
                  <option value="171">Oman</option>
                  <option value="177">Pakistan</option>
                  <option value="184">Palau</option>
                  <option value="172">Panama</option>
                  <option value="175">Papua New Guinea</option>
                  <option value="185">Paraguay</option>
                  <option value="173">Peru</option>
                  <option value="176">Philippines</option>
                  <option value="180">Pitcairn Islands</option>
                  <option value="178">Poland</option>
                  <option value="183">Portugal</option>
                  <option value="181">Puerto Rico</option>
                  <option value="186">Qatar</option>
                  <option value="188">Romania</option>
                  <option value="190">Russian Federation</option>
                  <option value="191">Rwanda</option>
                  <option value="187">Réunion</option>
                  <option value="26">Saint Barthélemy</option>
                  <option value="198">Saint Helena, Ascension and Tristan da Cunha</option>
                  <option value="119">Saint Kitts and Nevis</option>
                  <option value="127">Saint Lucia</option>
                  <option value="140">Saint Martin (French part)</option>
                  <option value="179">Saint Pierre and Miquelon</option>
                  <option value="237">Saint Vincent and the Grenadines</option>
                  <option value="244">Samoa</option>
                  <option value="203">San Marino</option>
                  <option value="192">Saudi Arabia</option>
                  <option value="204">Senegal</option>
                  <option value="189">Serbia</option>
                  <option value="194">Seychelles</option>
                  <option value="202">Sierra Leone</option>
                  <option value="197">Singapore</option>
                  <option value="210">Sint Maarten (Dutch part)</option>
                  <option value="201">Slovakia</option>
                  <option value="199">Slovenia</option>
                  <option value="193">Solomon Islands</option>
                  <option value="205">Somalia</option>
                  <option value="247">South Africa</option>
                  <option value="89">South Georgia and the South Sandwich Islands</option>
                  <option value="121">South Korea</option>
                  <option value="207">South Sudan</option>
                  <option value="68">Spain</option>
                  <option value="129">Sri Lanka</option>
                  <option value="182">State of Palestine</option>
                  <option value="195">Sudan</option>
                  <option value="206">Suriname</option>
                  <option value="200">Svalbard and Jan Mayen</option>
                  <option value="196">Sweden</option>
                  <option value="43">Switzerland</option>
                  <option value="211">Syria</option>
                  <option value="208">São Tomé and Príncipe</option>
                  <option value="227">Taiwan</option>
                  <option value="218">Tajikistan</option>
                  <option value="228">Tanzania</option>
                  <option value="217">Thailand</option>
                  <option value="223">Timor-Leste</option>
                  <option value="216">Togo</option>
                  <option value="219">Tokelau</option>
                  <option value="222">Tonga</option>
                  <option value="225">Trinidad and Tobago</option>
                  <option value="221">Tunisia</option>
                  <option value="220">Turkmenistan</option>
                  <option value="213">Turks and Caicos Islands</option>
                  <option value="226">Tuvalu</option>
                  <option value="224">Türkiye</option>
                  <option value="232">USA Minor Outlying Islands</option>
                  <option value="230">Uganda</option>
                  <option value="229">Ukraine</option>
                  <option value="2">United Arab Emirates</option>
                  <option value="231">United Kingdom</option>
                  <option value="233">United States</option>
                  <option value="234">Uruguay</option>
                  <option value="235">Uzbekistan</option>
                  <option value="242">Vanuatu</option>
                  <option value="238">Venezuela</option>
                  <option value="241">Vietnam</option>
                  <option value="239">Virgin Islands (British)</option>
                  <option value="240">Virgin Islands (USA)</option>
                  <option value="243">Wallis and Futuna</option>
                  <option value="66">Western Sahara</option>
                  <option value="245">Yemen</option>
                  <option value="248">Zambia</option>
                  <option value="249">Zimbabwe</option>
                  <option value="15">Åland Islands</option>
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className={labelClass}>Password</label>
                <div className="relative"><ShieldCheck className={fieldIconClass} />
                <input type="password" placeholder = "••••••••" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
              </div>

              <div>
                <label className={labelClass}>Confirm Password</label>
                <div className="relative"><ShieldCheck className={fieldIconClass} />
                <input type="password" placeholder = "••••••••" className={inputClass} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required /></div>
              </div>

              <label className="flex items-start gap-2 text-[11px] text-slate-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  required
                  className="mt-0.5 accent-tiffany-600"
                />
                <span>
                  I agree to the{' '}
                  <a href="https://app.snabbb.com/terms" target="_blank" rel="noreferrer" className="font-semibold text-tiffany-600 hover:underline">Terms of Service</a>,{' '}
                  <a href="https://app.snabbb.com/privacy" target="_blank" rel="noreferrer" className="font-semibold text-tiffany-600 hover:underline">Privacy Policy</a>{' '}
                  and{' '}
                  <a href="https://app.snabbb.com/disclaimer" target="_blank" rel="noreferrer" className="font-semibold text-tiffany-600 hover:underline">Disclaimer</a>.
                </span>
              </label>

              <button
                type="submit"
                disabled={loading}
                className={`w-full bg-slate-900 text-white py-3 rounded-xl font-bold text-base transition-all shadow-lg shadow-slate-900/10 mt-2 ${
                  loading ? 'bg-slate-400 cursor-not-allowed' : 'bg-slate-900 hover:bg-slate-800'
                }`}
              >
                {loading ? 'Signing up…' : 'Sign up'}
              </button>
            </form>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => setView('login')}
                className="text-[hsl(180_14%_49%)] font-bold text-xs hover:underline"
              >
                Already have an account?
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="text-center">
              <h2 className="text-xl font-bold text-slate-800">Welcome Back</h2>
            </div>

            {!!errorMsg && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className={labelClass}>Email</label>
                <input
                  type="email"
                  className={inputClass}
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-600">Password</label>
                  <button
                    type="button"
                    className="text-tiffany-600 text-[10px] font-bold hover:underline"
                    onClick={() => setErrorMsg('Password reset is not implemented yet.')}
                  >
                    Forgot Password?
                  </button>
                </div>
                <input
                  type="password"
                  className={inputClass}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="flex items-center">
                <input type="checkbox" className="w-4 h-4 text-[#004aad]" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)}/>
                <span className="text-xs text-slate-600 ml-2">Remember me</span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className={`w-full bg-slate-900 text-white py-3 rounded-xl font-bold text-base transition-all shadow-lg shadow-slate-900/10 mt-2 ${
                  loading ? 'bg-slate-400 cursor-not-allowed' : 'bg-slate-900 hover:bg-slate-800'
                }`}
              >
                {loading ? 'Logging in…' : 'Log in'}
              </button>
            </form>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setView('signup')}
                className="text-[hsl(180_14%_49%)] font-bold text-xs hover:underline"
              >
                Don't have an account? Sign up
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LandingModal;

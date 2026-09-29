export const VENDOR_ID_TYPES = [
  'National ID (NIN)',
  'International Passport',
  "Driver's License",
  "Voter's Card",
] as const

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'sharklasers.com',
  'grr.la',
  'yopmail.com',
  'tempmail.com',
  'tempmailo.com',
  '10minutemail.com',
  'trashmail.com',
  'discard.email',
  'getnada.com',
  'moakt.com',
  'emailondeck.com',
  'fakeinbox.com',
  'maildrop.cc',
  'mailnesia.com',
])

export type VendorOnboardingInput = {
  companyName: string
  businessRegistrationNumber: string
  phone: string
  address: string
  personalName: string
  idType: string
  idNumber: string
  domain?: string
  termsAccepted: boolean
  email?: string
}

export function isDisposableVendorEmail(email?: string) {
  const domain = String(email || '').trim().toLowerCase().split('@')[1] || ''
  return DISPOSABLE_EMAIL_DOMAINS.has(domain)
}

export function validateVendorOnboarding(input: VendorOnboardingInput) {
  const errors: Record<string, string> = {}
  const company = input.companyName.trim()
  const address = input.address.trim()
  const person = input.personalName.trim()
  const phoneDigits = input.phone.replace(/\D/g, '')
  const cac = input.businessRegistrationNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  const idNumber = input.idNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase()

  if (company.length < 3) errors.companyName = 'Enter the registered company or business name.'
  if (['test', 'testing', 'company', 'my company', 'vendor', 'business', 'abc', 'asdf', 'n/a', 'na', 'none'].includes(company.toLowerCase())) {
    errors.companyName = 'Use your real registered business name.'
  }
  if (input.email && isDisposableVendorEmail(input.email)) {
    errors.email = 'Use a durable work email. Temporary inboxes are not allowed for vendors.'
  }
  if (cac.length < 6 || !/\d{4,}/.test(cac) || ['123456', '000000', 'N/A', 'NA', 'TEST'].includes(cac)) {
    errors.businessRegistrationNumber = 'Enter a valid CAC number such as RC123456 or BN1234567.'
  }
  const validPhone =
    (phoneDigits.startsWith('234') && phoneDigits.length === 13) ||
    (phoneDigits.startsWith('0') && phoneDigits.length === 11) ||
    phoneDigits.length === 10
  if (!validPhone) errors.phone = 'Enter a valid Nigerian business phone number.'
  if (address.length < 12) errors.address = 'Enter a full business address, including street and city.'
  if (person.split(/\s+/).filter(Boolean).length < 2) {
    errors.personalName = 'Enter the full name of the authorized officer.'
  }
  if (!VENDOR_ID_TYPES.includes(input.idType as (typeof VENDOR_ID_TYPES)[number])) {
    errors.idType = 'Select a government ID type.'
  } else if (input.idType.startsWith('National ID') && !/^\d{11}$/.test(idNumber)) {
    errors.idNumber = 'NIN must be 11 digits.'
  } else if (idNumber.length < 6) {
    errors.idNumber = 'Enter the ID number as it appears on the document.'
  }
  if (!input.termsAccepted) {
    errors.termsAccepted = 'Confirm that these details are true and you are authorized to sell.'
  }
  return errors
}

export type VendorVatInput = {
  chargeVat: boolean
  tin: string
  taxClearanceExpiresAt: string
  vatCertificate?: File | null
  taxClearance?: File | null
}

export function validateVendorVat(input: VendorVatInput, requireFiles = true) {
  const errors: Record<string, string> = {}
  if (!input.chargeVat) return errors
  const digits = input.tin.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 13 || new Set(digits).size === 1) {
    errors.tin = 'Enter a valid Tax Identification Number (8 to 13 digits).'
  }
  if (!input.taxClearanceExpiresAt) {
    errors.taxClearanceExpiresAt = 'Enter the expiry date on your tax clearance certificate.'
  } else if (new Date(input.taxClearanceExpiresAt).getTime() < Date.now()) {
    errors.taxClearanceExpiresAt = 'This tax clearance has expired. Use a current certificate.'
  }
  if (requireFiles && !input.vatCertificate) errors.vatCertificate = 'Attach your VAT registration certificate.'
  if (requireFiles && !input.taxClearance) errors.taxClearance = 'Attach your tax clearance certificate.'
  return errors
}

export type VatStatus = 'none' | 'pending' | 'approved' | 'rejected'

export function vatStatusLabel(status?: string, canCharge?: boolean) {
  if (canCharge) return 'VAT registered'
  switch (status) {
    case 'pending':
      return 'VAT in review'
    case 'rejected':
      return 'VAT rejected'
    case 'approved':
      return 'VAT paused'
    default:
      return 'Not VAT registered'
  }
}

export function vendorStatus(vendor?: { verification_status?: string; revoked?: boolean } | null) {
  if (vendor?.revoked) return 'revoked'
  const raw = String(vendor?.verification_status || '').trim()
  const tail = raw.includes('.') ? raw.split('.').pop() || raw : raw
  return tail.toLowerCase()
}

export function vendorCanList(vendor?: { verification_status?: string; can_list_products?: boolean; revoked?: boolean } | null) {
  if (vendor?.revoked) return false
  return Boolean(vendor?.can_list_products || vendorStatus(vendor) === 'verified')
}

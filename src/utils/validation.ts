export const isValidEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const isValidCode = (code: string): boolean => {
  return /^[a-zA-Z0-9_-]{2,20}$/.test(code);
};

export const isValidPhone = (phone: string): boolean => {
  return /^\+?[\d\s\-()]{8,20}$/.test(phone);
};

export const validateField = (name: string, value: string): string => {
  if (!value) return '';

  switch (name) {
    case 'email':
    case 'hotel_email':
    case 'company_email':
      return isValidEmail(value) ? '' : 'Invalid email format';
    case 'code':
      return isValidCode(value) ? '' : 'Code must be 2-20 alphanumeric characters';
    case 'telephone':
    case 'hotel_tel':
    case 'company_tel':
      return isValidPhone(value) ? '' : 'Invalid phone number format';
    case 'username':
      return isValidEmail(value) ? '' : 'Username must be a valid email address';
    default:
      return '';
  }
};

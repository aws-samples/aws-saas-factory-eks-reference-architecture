// JWT Token Utilities

export interface DecodedJWT {
  header: any;
  payload: any;
  signature: string;
  raw: {
    header: string;
    payload: string;
    signature: string;
  };
}

export const decodeJWT = (token: string): DecodedJWT | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Base64 URL decode function
    const base64UrlDecode = (str: string): string => {
      // Add padding if needed
      let padded = str;
      while (padded.length % 4) {
        padded += '=';
      }
      // Replace URL-safe characters
      padded = padded.replace(/-/g, '+').replace(/_/g, '/');
      return atob(padded);
    };

    // Decode header and payload
    const headerJson = base64UrlDecode(headerB64);
    const payloadJson = base64UrlDecode(payloadB64);

    return {
      header: JSON.parse(headerJson),
      payload: JSON.parse(payloadJson),
      signature: signatureB64,
      raw: {
        header: headerB64,
        payload: payloadB64,
        signature: signatureB64,
      },
    };
  } catch (error) {
    console.error('Error decoding JWT:', error);
    return null;
  }
};

export const formatTokenForDisplay = (token: string, maxLength: number = 100): string => {
  if (!token) return 'N/A';
  if (token.length <= maxLength) return token;
  return `${token.substring(0, maxLength)}...`;
};

export const formatTimestamp = (timestamp: number): string => {
  return new Date(timestamp * 1000).toLocaleString();
};
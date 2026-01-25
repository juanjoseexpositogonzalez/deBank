function parsePaymentSignature(paymentSignature) {
  // El PAYMENT-SIGNATURE header contiene:
  // signature=<r>,<s>,<v>;authorization=<authorization_data>
  const parts = paymentSignature.split(';');
  const signature = {};
  
  parts.forEach(part => {
    const [key, value] = part.split('=');
    if (key === 'signature') {
      const [r, s, v] = value.split(',');
      signature.r = r;
      signature.s = s;
      signature.v = parseInt(v);
    } else if (key === 'authorization') {
      try {
        signature.authorization = JSON.parse(Buffer.from(value, 'base64').toString());
      } catch (e) {
        signature.authorization = value; // Fallback si no es base64
      }
    }
  });

  return signature;
}

module.exports = { parsePaymentSignature };

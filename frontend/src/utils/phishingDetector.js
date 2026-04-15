export function extractLinks(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.match(urlRegex) || [];
}

export function detectPhishing(email) {

  const suspiciousWords = [
    "urgent",
    "verify your account",
    "click here",
    "password",
    "bank",
    "update your information",
    "login immediately",
    "account suspended"
  ];

  const suspiciousShortLinks = [
    "bit.ly",
    "tinyurl.com",
    "goo.gl"
  ];

  const trustedDomains = [
    "gmail.com",
    "paypal.com",
    "amazon.com",
    "microsoft.com"
  ];

  let score = 0;

  const text = (email.subject + " " + email.body).toLowerCase();

  // keyword detection
  suspiciousWords.forEach(word => {
    if (text.includes(word)) {
      score += 1;
    }
  });

  // link extraction
  const links = extractLinks(email.body);

  links.forEach(link => {

    // shortened links
    suspiciousShortLinks.forEach(short => {
      if (link.includes(short)) {
        score += 2;
      }
    });

    try {
      const url = new URL(link);
      const domain = url.hostname.replace("www.", "");

      if (!trustedDomains.includes(domain)) {
        score += 1;
      }

    } catch (err) {
      score += 1;
    }

  });

  return {
    score,
    isPhishing: score >= 3,
    links
  };
}
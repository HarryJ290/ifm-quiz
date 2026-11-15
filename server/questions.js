// The correct answer index lives ONLY here, on the server. It is never sent
// to a phone until the question closes (see publicQ() in index.js).
export const QUESTIONS = [
  {
    text: 'At a steady 8% annual return, roughly how many years does it take for money to double (Rule of 72)?',
    options: ['4 years', '9 years', '12 years', '18 years'],
    correct: 1,
    source: 'https://www.investopedia.com/terms/r/ruleof72.asp',
  },
  {
    text: 'In India, up to how much of a depositor\u2019s money in one bank is insured by DICGC?',
    options: ['\u20B91 lakh', '\u20B92 lakh', '\u20B95 lakh', '\u20B910 lakh'],
    correct: 2,
    source: 'https://www.dicgc.org.in/',
  },
  {
    text: 'What is the standard maturity (lock-in) period of a Public Provident Fund (PPF) account?',
    options: ['5 years', '10 years', '15 years', '25 years'],
    correct: 2,
    source: 'https://www.nsiindia.gov.in/',
  },
  {
    text: '\u20B910,000 earns 10% a year, compounded annually. What is it worth after 2 years?',
    options: ['\u20B912,000', '\u20B912,100', '\u20B912,200', '\u20B911,000'],
    correct: 1,
    source: 'https://www.investopedia.com/terms/c/compoundinterest.asp',
  },
  {
    text: 'RBI\u2019s CPI inflation target is 4%. What is the tolerance band around it?',
    options: ['\u00B11%', '\u00B12%', '\u00B13%', '\u00B14%'],
    correct: 1,
    source: 'https://www.rbi.org.in/',
  },
];

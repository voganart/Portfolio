import React from 'react';

const TelegramIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    {...props}
  >
    <path d="M9.999 15.5l-.398 5.6c.57 0 .818-.245 1.117-.54l2.68-2.557 5.556 4.07c1.02.563 1.742.27 2.004-.945l3.63-16.98.002-.004c.329-1.522-.549-2.118-1.55-1.757L1.83 9.847c-1.466.57-1.446 1.385-.25 1.754l5.435 1.697L19.6 5.958 9.999 15.5z" />
  </svg>
);

export default TelegramIcon;

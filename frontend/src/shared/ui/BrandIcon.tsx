interface Props {
  className?: string;
  'aria-hidden'?: boolean;
}

export function BrandIcon({ className, 'aria-hidden': ariaHidden }: Props) {
  return (
    <svg
      className={className}
      width="46"
      height="62"
      viewBox="0 0 46 62"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="DopaFit"
      aria-hidden={ariaHidden}
      style={{ filter: 'drop-shadow(0 0.04em 0.13em rgba(0, 0, 0, 0.18))' }}
    >
      {/*
        viewBox height 62 (not a tight crop) matches BrandWordmark's 62-tall box so
        Logo's items-center aligns the icon and wordmark. The plate (y=3..48.9) sits
        slightly high on purpose — it compensates for the wordmark's descenders.
      */}
      <g clipPath="url(#brandicon_clip)">
        <rect y="3" width="45.9035" height="45.9035" rx="5" style={{ fill: 'var(--color-logo)' }} />
        <path
          d="M48.1377 -0.464844C48.7829 -1.0838 49.8085 -1.06306 50.4277 -0.417969C51.0467 0.227462 51.0253 1.25289 50.3799 1.87207L37.9131 13.8301L36.8652 14.835L37.2188 16.2422L40.5654 29.5771C40.8432 30.684 40.5005 31.8503 39.6807 32.6367L29.1191 42.7686C28.3529 43.5034 27.2737 43.8079 26.2432 43.5918L26.0381 43.542L13.2119 39.9521L11.791 39.5547L10.7559 40.6074C10.7398 40.6237 10.7257 40.6382 10.7168 40.6475L10.7012 40.6631L10.7227 40.6426L-2.28711 53.123C-2.93253 53.7418 -3.95803 53.7202 -4.57715 53.0752C-5.19634 52.4297 -5.17569 51.4033 -4.53027 50.7842L8.47949 38.3057L8.48047 38.3047C8.49915 38.2868 8.51906 38.2682 8.54004 38.25L9.7002 37.2432L9.32617 35.7539L6.57324 24.7842L6.20605 23.3184L4.73633 22.9629C4.6676 22.9463 4.60971 22.929 4.56055 22.9111H4.55957L-12.3691 16.7529C-13.2087 16.4474 -13.6426 15.5188 -13.3369 14.6777C-13.0311 13.8371 -12.1025 13.404 -11.2627 13.709L5.46191 19.793L6.92383 20.3252L8.04688 19.248L17.5947 10.0898L17.8135 9.89355C18.5581 9.27967 19.5441 9.03386 20.4902 9.22656L20.7598 9.29297L32.7041 12.6348L34.0918 13.0234L35.1221 12.0186L35.1279 12.0137L48.1377 -0.464844Z"
          style={{ stroke: 'var(--color-logo-fg)' }}
          strokeWidth="5"
          strokeLinecap="round"
        />
      </g>
      <defs>
        <clipPath id="brandicon_clip">
          <rect y="3" width="45.9035" height="45.9035" rx="5" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

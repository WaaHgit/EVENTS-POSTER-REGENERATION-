export interface MerchandiseProduct {
  id: string;
  name: string;
  description: string;
  price: string;
  imageUrl: string;
  inStock?: boolean;
  zoom?: number;       // Zoom level: 1.0 (100%) to 3.0 (300%), default 1
  offsetX?: number;    // X-Axis offset percentage: -100% to +100%, default 0
  offsetY?: number;    // Y-Axis offset percentage: -100% to +100%, default 0
}

export interface ThankYouSettings {
  enabled: boolean;
  title: string;
  message: string;
}

export interface CallToActionSettings {
  enabled: boolean;
  title: string;
  subtitle: string;
  phoneNumber: string;
  contactPerson: string;
  products: MerchandiseProduct[];
}

export interface AppSettings {
  thankYouNote: ThankYouSettings;
  callToAction: CallToActionSettings;
  activePosterTemplateId: string;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  thankYouNote: {
    enabled: false,
    title: '',
    message: ''
  },
  callToAction: {
    enabled: false,
    title: '',
    subtitle: '',
    phoneNumber: '',
    contactPerson: '',
    products: []
  },
  activePosterTemplateId: 'utq-20th-anniversary-default'
};

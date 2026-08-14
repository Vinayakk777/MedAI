// ─── Provider interfaces and mock adapters ───
// These interfaces define the contract for real integrations.
// Mock adapters provide realistic placeholder data.

export interface ProviderLocation {
  name: string;
  address: string;
  phone: string;
  distance: string; // e.g. "2.3 miles"
  rating: number; // 0-5
  openNow: boolean;
  hours?: string;
  services?: string[];
  acceptsInsurance?: string[];
}

export interface HospitalFinder {
  findNearest(lat: number, lng: number, radius?: number): Promise<ProviderLocation[]>;
  findByName(name: string): Promise<ProviderLocation | null>;
}

export interface NearbyClinics {
  findUrgentCare(lat: number, lng: number, radius?: number): Promise<ProviderLocation[]>;
  findPrimaryCare(lat: number, lng: number, radius?: number): Promise<ProviderLocation[]>;
}

export interface TelemedicineProvider {
  name: string;
  url: string;
  availableNow: boolean;
  specialties: string[];
  waitTimeMinutes: number;
}

export interface TelemedicineService {
  getAvailableProviders(): Promise<TelemedicineProvider[]>;
  getProviderBySpecialty(specialty: string): Promise<TelemedicineProvider[]>;
}

export interface AmbulanceService {
  name: string;
  phone: string;
  serviceArea: string[];
  hasEmergencyDispatch: boolean;
}

export interface AmbulanceServiceProvider {
  getService(lat: number, lng: number): Promise<AmbulanceService | null>;
  getAllServices(): Promise<AmbulanceService[]>;
}

// ─── Mock Data ───

const MOCK_HOSPITALS: ProviderLocation[] = [
  {
    name: "City General Hospital",
    address: "123 Main Street, Anytown, USA",
    phone: "(555) 123-4567",
    distance: "1.2 miles",
    rating: 4.2,
    openNow: true,
    hours: "24 hours",
    services: ["Emergency Department", "Cardiology", "Neurology", "Radiology", "Laboratory"],
    acceptsInsurance: ["Aetna", "Blue Cross", "Cigna", "United Healthcare"],
  },
  {
    name: "University Medical Center",
    address: "456 College Ave, Anytown, USA",
    phone: "(555) 987-6543",
    distance: "3.5 miles",
    rating: 4.5,
    openNow: true,
    hours: "24 hours",
    services: ["Emergency Department", "Trauma Center", "Pediatrics", "Women's Health", "Surgery"],
    acceptsInsurance: ["Aetna", "Blue Cross", "Medicare", "Medicaid"],
  },
  {
    name: "Riverside Community Hospital",
    address: "789 River Road, Anytown, USA",
    phone: "(555) 456-7890",
    distance: "5.8 miles",
    rating: 3.8,
    openNow: true,
    hours: "24 hours",
    services: ["Emergency Department", "Urgent Care", "Radiology", "Laboratory"],
    acceptsInsurance: ["Blue Cross", "Cigna", "Medicare"],
  },
];

const MOCK_CLINICS: ProviderLocation[] = [
  {
    name: "QuickCare Urgent Care",
    address: "321 Oak Street, Anytown, USA",
    phone: "(555) 222-3333",
    distance: "0.8 miles",
    rating: 4.0,
    openNow: true,
    hours: "8:00 AM – 8:00 PM",
    services: ["Urgent Care", "X-Ray", "Lab Testing", "Physical Exams"],
    acceptsInsurance: ["Aetna", "Blue Cross", "Cigna"],
  },
  {
    name: "Anytown Family Medicine",
    address: "555 Elm Street, Anytown, USA",
    phone: "(555) 333-4444",
    distance: "1.5 miles",
    rating: 4.3,
    openNow: false,
    hours: "9:00 AM – 5:00 PM Mon-Fri",
    services: ["Primary Care", "Preventive Medicine", "Chronic Disease Management"],
    acceptsInsurance: ["Aetna", "Blue Cross", "Cigna", "United Healthcare"],
  },
  {
    name: "MedExpress Walk-In Clinic",
    address: "777 Pine Lane, Anytown, USA",
    phone: "(555) 444-5555",
    distance: "2.1 miles",
    rating: 3.9,
    openNow: true,
    hours: "7:00 AM – 10:00 PM",
    services: ["Urgent Care", "Vaccinations", "Physicals", "Lab Work"],
    acceptsInsurance: ["Blue Cross", "Cigna", "Medicare", "Medicaid"],
  },
];

const MOCK_TELEMEDICINE: TelemedicineProvider[] = [
  {
    name: "Teladoc",
    url: "https://www.teladoc.com",
    availableNow: true,
    specialties: ["General Medicine", "Pediatrics", "Mental Health", "Dermatology"],
    waitTimeMinutes: 15,
  },
  {
    name: "MDLive",
    url: "https://www.mdlive.com",
    availableNow: true,
    specialties: ["General Medicine", "Pediatrics", "Psychiatry", "Therapy"],
    waitTimeMinutes: 20,
  },
  {
    name: "Amwell",
    url: "https://amwell.com",
    availableNow: true,
    specialties: ["Urgent Care", "General Medicine", "Mental Health", "Nutrition"],
    waitTimeMinutes: 10,
  },
];

const MOCK_AMBULANCE: AmbulanceService[] = [
  {
    name: "City EMS",
    phone: "108",
    serviceArea: ["Anytown", "Surrounding County"],
    hasEmergencyDispatch: true,
  },
  {
    name: "MedicOne Ambulance",
    phone: "(555) 111-2222",
    serviceArea: ["Anytown", "West County", "East County"],
    hasEmergencyDispatch: true,
  },
];

// ─── Mock Adapters ───

export const mockHospitalFinder: HospitalFinder = {
  async findNearest(_lat: number, _lng: number, _radius?: number): Promise<ProviderLocation[]> {
    await delay(600);
    return MOCK_HOSPITALS;
  },
  async findByName(name: string): Promise<ProviderLocation | null> {
    await delay(300);
    return MOCK_HOSPITALS.find((h) => h.name.toLowerCase().includes(name.toLowerCase())) ?? null;
  },
};

export const mockNearbyClinics: NearbyClinics = {
  async findUrgentCare(_lat: number, _lng: number, _radius?: number): Promise<ProviderLocation[]> {
    await delay(500);
    return MOCK_CLINICS.filter((c) => c.name.toLowerCase().includes("urgent") || c.name.toLowerCase().includes("express"));
  },
  async findPrimaryCare(_lat: number, _lng: number, _radius?: number): Promise<ProviderLocation[]> {
    await delay(500);
    return MOCK_CLINICS.filter((c) => c.name.toLowerCase().includes("family") || c.name.toLowerCase().includes("primary"));
  },
};

export const mockTelemedicineService: TelemedicineService = {
  async getAvailableProviders(): Promise<TelemedicineProvider[]> {
    await delay(400);
    return MOCK_TELEMEDICINE.filter((t) => t.availableNow);
  },
  async getProviderBySpecialty(specialty: string): Promise<TelemedicineProvider[]> {
    await delay(400);
    return MOCK_TELEMEDICINE.filter((t) =>
      t.specialties.some((s) => s.toLowerCase().includes(specialty.toLowerCase())),
    );
  },
};

export const mockAmbulanceServiceProvider: AmbulanceServiceProvider = {
  async getService(_lat: number, _lng: number): Promise<AmbulanceService | null> {
    await delay(300);
    return MOCK_AMBULANCE[0];
  },
  async getAllServices(): Promise<AmbulanceService[]> {
    await delay(300);
    return MOCK_AMBULANCE;
  },
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

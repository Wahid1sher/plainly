// Fictional sample documents for demos. All people, numbers and addresses are made up.

export interface Sample {
  id: string;
  label: string;
  emoji: string;
  text: string;
}

export const SAMPLES: Sample[] = [
  {
    id: 'hospital-bill',
    label: 'Hospital bill',
    emoji: '🏥',
    text: `RIVERSIDE GENERAL HOSPITAL — PATIENT STATEMENT
Statement date: November 3, 2026

Patient name: Maria Elena Lopez
Date of birth: 04/17/1981
Account #: RGH-55821934
Guarantor: Maria Elena Lopez, 1427 Juniper Street, Apt 3B, Fresno, CA 93721
Phone on file: (559) 555-0148   Email: maria.lopez81@example.com

Dates of service: 09/12/2026 – 09/14/2026   Admission type: Emergency

DESCRIPTION OF SERVICES                     CHARGES
Emergency department, level 5               $3,850.00
CT scan, abdomen w/ contrast                $4,212.00
Room and board, semi-private (2 days)       $6,400.00
Laboratory services                         $1,187.50
Pharmacy                                      $942.30
                                    TOTAL CHARGES  $16,591.80
Insurance payments (BlueValley PPO, Member ID: BVX449201877)   -$11,204.66
Contractual adjustment                                          -$2,310.00
                              PATIENT RESPONSIBILITY   $3,077.14

AMOUNT DUE BY December 3, 2026: $3,077.14

Your insurer applied $2,500.00 to your annual deductible and 20% coinsurance to the remaining allowed amount. If you believe your insurer processed this claim incorrectly, contact BlueValley PPO.

Financial assistance: Riverside General offers charity care and discounted care to patients with household income at or below 400% of the Federal Poverty Level. Applications must be received within 240 days of the first post-discharge billing statement. Interest-free payment plans of up to 24 months are available.

Accounts with no payment or payment arrangement 120 days after the first statement may be referred to a collection agency.

To pay or ask questions, call Patient Financial Services at 1-800-555-0199, Monday–Friday 8am–5pm.`,
  },
  {
    id: 'rent-increase',
    label: 'Rent increase notice',
    emoji: '🏠',
    text: `NOTICE OF CHANGE IN TERMS OF TENANCY
(California Civil Code Section 827)

To: Daniel Okafor and all other occupants
Premises: 88 Willow Creek Road, Unit 12, Sacramento, CA 95814

Date served: October 30, 2026

PLEASE TAKE NOTICE that, pursuant to Civil Code Section 827, the terms of your month-to-month tenancy of the above premises are changed as follows:

Effective January 1, 2027, the monthly rent will be increased from $1,850.00 to $2,035.00, an increase of $185.00 (10%).

In addition, effective the same date, a monthly utility fee of $45.00 for water and trash will be added, and the parking space previously included will be charged at $75.00 per month.

All other terms and conditions of your tenancy remain in full force and effect.

This notice is being served at least 90 days before the effective date as required for increases greater than 10% of the lowest rent charged during the previous 12 months.

If this property is subject to the Tenant Protection Act of 2019 (AB 1482), annual rent increases are limited to 5% plus the change in cost of living, or 10%, whichever is lower.

Landlord/Agent: Crestline Property Management, LLC
Tenant ID: CPM-T-20931
Contact: leasing@crestline-pm.example, (916) 555-0102`,
  },
  {
    id: 'benefits-letter',
    label: 'Benefits letter',
    emoji: '📬',
    text: `STATE DEPARTMENT OF HUMAN SERVICES
Supplemental Nutrition Assistance Program (SNAP)
NOTICE OF ACTION — REQUEST FOR VERIFICATION

Date of notice: November 6, 2026
Case number: 7730-418-2296
Dear Ahmad Rahimi,

We are reviewing your household's eligibility for SNAP benefits as part of your periodic recertification. To continue receiving benefits without interruption, we need the following information:

1. Proof of all household income for the last 30 days (pay stubs, employer letter, or self-employment records).
2. Proof of current shelter costs (lease, mortgage statement, or rent receipt).
3. A completed Form DHS-1171 (Change Report), enclosed.

You must return these documents by November 20, 2026. You may upload them through the online portal, fax them to (555) 555-0177, or mail them to the address on the enclosed envelope.

If we do not receive the information by the due date, your SNAP benefits may stop on November 30, 2026. If your benefits stop, you will have to reapply.

You have the right to request a fair hearing if you disagree with any action we take on your case. You must request a hearing within 90 days of the date of this notice. If you request a hearing before the effective date of the action, your benefits may continue until the hearing decision.

If you need an interpreter or help gathering documents, call your caseworker, Ms. Janet Wu, at 1-800-555-0123 (TTY 711). Interpreter services are free.

Client ID: SN-00482117
Address on file: 2210 Lakeview Avenue, Apt 7, Columbus, OH 43215`,
  },
];

# Muphenomics Digest - Design System & Style Guide

## Color Palette

### Primary Blues (Professional Branding)
- **Deep Blue (Primary)**: `#1e40af` - Main headings, primary text, key accents
- **Medium Blue (Secondary)**: `#2563eb` - Secondary headings, borders, hover states
- **Bright Blue (Tertiary)**: `#3b82f6` - Interactive elements, growth indicators, accent highlights
- **Light Blue (Accent)**: `#60a5fa` - Subtle backgrounds, secondary accents
- **Very Light Blue (Background)**: `#dbeafe` - Main background container
- **Lightest Blue (Subtle Background)**: `#e0f2fe` - Card backgrounds, subtle fills
- **Palest Blue (Hover States)**: `#f0f9ff` - Light hover effects, subtle highlighting

### Neutral Colors
- **Dark Gray/Charcoal (Text)**: `#1f2937` - Body text, labels, primary readable content
- **Medium Gray (Secondary Text)**: `#4b5563` - Secondary text, supporting content
- **Light Gray (Tertiary Text)**: `#64748b` - Disabled text, hints, less important info
- **Very Light Gray (Borders)**: `#e2e8f0` - Dividers, subtle borders
- **Off-White (Surface)**: `#f8fafc` - Card backgrounds, subtle surface
- **White (Primary Background)**: `#ffffff` - Main content areas, cards

### Status Colors (Functional)
- **Success/Growth**: `#10b981` - Growth trends, positive indicators (kept from original)
- **Decline/Negative**: `#ef4444` - Decline trends, negative indicators (kept from original)
- **Warning**: `#f59e0b` - Alerts, warnings

---

## Typography System

### Font Stack
- **Display Font**: `Montserrat` (700 weight) - Main headings, titles
- **Body Font**: `Inter` (400-600 weight) - Body text, labels, UI
- **Fun/Feature Font**: `Fredoka` (400-600 weight) - Reserved for future special elements

### Heading Hierarchy

#### H1 - Main Site Title
- Font: Montserrat
- Weight: 700
- Size: 3.5rem (56px)
- Color: `#1e40af`
- Letter Spacing: -1px
- Example: "Muphenomics Digest"

#### H2 - Section Headings (Widgets)
- Font: Montserrat
- Weight: 700
- Size: 1.8rem (28.8px)
- Color: `#1e40af`
- Letter Spacing: 0px

#### H3 - Subsection Headings (Sidebar Widgets)
- Font: Montserrat
- Weight: 700
- Size: 1.3rem (20.8px)
- Color: `#1e40af`
- Letter Spacing: 0px

#### H4 - Card Titles (Article Cards)
- Font: Inter
- Weight: 600
- Size: 1rem (16px)
- Color: `#1e40af`
- Letter Spacing: 0px

### Body Text

#### Primary Body Text
- Font: Inter
- Weight: 400
- Size: 0.9rem (14.4px)
- Color: `#1f2937`
- Line Height: 1.6

#### Secondary Text (Labels, Metadata)
- Font: Inter
- Weight: 500
- Size: 0.875rem (14px)
- Color: `#4b5563`
- Line Height: 1.5

#### Tertiary Text (Helper Text, Disabled)
- Font: Inter
- Weight: 400
- Size: 0.8rem (12.8px)
- Color: `#64748b`
- Line Height: 1.4

#### Uppercase Labels (Indicator Cards)
- Font: Inter
- Weight: 700
- Size: 0.75rem (12px)
- Color: `#1f2937`
- Text Transform: UPPERCASE
- Letter Spacing: 1px

#### Large Numbers (Data Display)
- Font: Montserrat
- Weight: 700
- Size: 2rem (32px)
- Color: `#1e40af`
- Letter Spacing: 0px

---

## Component Color Reference

### Header
- Background: Linear Gradient `135deg, #3b82f6 0%, #2563eb 50%, #1e40af 100%`
- Text Color: White
- Heading Color: `#1e40af`
- Subtitle Color: `#e0f2fe` (light blue with opacity 0.95)

### Navigation Bar
- Background: Linear Gradient `135deg, #2563eb 0%, #1e40af 100%`
- Border Bottom: `1px solid rgba(59, 130, 246, 0.2)`
- Link Color (default): `rgba(255, 255, 255, 0.8)`
- Link Color (hover/active): White
- Link Background (hover): `rgba(255, 255, 255, 0.15)`

### Main Dashboard Container (Background)
- Background: Linear Gradient `135deg, #dbeafe 0%, #e0f2fe 100%`
- Border Radius: 20px
- Padding: 2rem

### Cards (Widgets)
- Background: `#ffffff`
- Border: `1px solid #e2e8f0`
- Border Radius: 16px
- Box Shadow: `0 4px 16px rgba(30, 64, 175, 0.08)`
- Box Shadow (hover): `0 12px 24px rgba(30, 64, 175, 0.12)`

### Indicator Cards (Inside Widgets)
- Background: Linear Gradient `135deg, #f8fafc 0%, #f1f5f9 100%`
- Border: `2px solid #e2e8f0`
- Border Left: `4px solid #3b82f6`
- Label Color: `#1f2937`
- Value Color: `#1e40af`

### Article Cards
- Background: Linear Gradient `135deg, #f8fafc 0%, #f1f5f9 100%`
- Border: `1px solid #e2e8f0`
- Border Left: `4px solid #3b82f6`
- Text Color: `#1f2937`
- Background (hover): Linear Gradient `135deg, #f1f5f9 0%, #e0e7ff 100%`

### Tags
- Background: `#dbeafe`
- Color: `#1e40af`
- Border Radius: 6px

### Chart (GDP Bar Chart)
- Grid Color: `rgba(30, 64, 175, 0.1)`
- Tick Color: `#1f2937`
- Growth Bars: `#3b82f6`
- Decline Bars: `#1e40af`

### Footer
- Background: Linear Gradient `135deg, #3b82f6 0%, #2563eb 50%, #1e40af 100%`
- Text Color: White
- Link Color: `#dbeafe`
- Link Color (hover): White

---

## Spacing System (Consistent with existing)
- XS: 0.5rem (8px)
- SM: 1rem (16px)
- MD: 1.5rem (24px)
- LG: 2rem (32px)
- XL: 3rem (48px)

---

## Shadow System
- Small: `0 1px 2px rgba(30, 64, 175, 0.05)`
- Medium: `0 4px 6px rgba(30, 64, 175, 0.08)`
- Large: `0 10px 15px rgba(30, 64, 175, 0.12)`

---

## Transitions & Animations
- Standard Transition: `all 0.3s ease`
- Hover Effects: Transform `translateY(-2px)` with shadow increase
- Border Radius: 6px (small), 10px (medium), 16px (large), 20px (container)

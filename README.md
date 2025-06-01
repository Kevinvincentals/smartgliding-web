# SmartGliding Web Platform

## 🇩🇰 Dansk

### Smartgliding

SmartGliding Web Platform er en komplet digital flyvebog til svæveflyverklubber. Systemet automatiserer logning af flyvninger og giver realtids-overvågning af klubbens aktiviteter.

### Hovedfunktioner

- **📋 Digital Flyvebog** - Automatisk logning af starter/landinger
- **👥 Pilothåndtering** - Medlemsadministration og rettigheder
- **✈️ Flyhåndtering** - Registrering og overvågning af klubfly
- **📊 Statistikker** - Detaljeret analyse af flyveaktivitet
- **🎓 Skoling** - DSVU uddannelsesmoduler til elevpiloter (IKKE FÆRDIGUDVIKLET, TALER IKKE SAMMEN MED DSVU, ER IKKE GODKENDT AF DSVU)
- **📱 Tablet Interface** - Tablet venlig grænseflade til flyvepladsen
- **🗺️ Live Tracking** - Realtidskort over flypositioner



## 🇬🇧 English

### Smartgliding

SmartGliding Web Platform is a complete digital flight logging system designed specifically for gliding clubs. The system automates flight logging and provides real-time monitoring of club activities through integration with FLARM/OGN data.

### Why is this needed?

Traditional flight logging is time-consuming and error-prone. SmartGliding automates the entire process by integrating with the Open Glider Network (OGN) for automatic flight detection and logging, while providing modern web-based tools for club management.

## 🏗️ Technical Architecture

### Core Technologies

- **Next.js 15** - React framework with App Router
- **TypeScript** - Type-safe development
- **Prisma** - Database ORM with MongoDB
- **WebSocket Integration** - Real-time data streaming
- **Shadcn UI** - Modern component library
- **Tailwind CSS** - Utility-first styling

### Backend Services Integration

- **SmartGliding OGN Backend** - Flight tracking and event detection
- **MongoDB** - Primary database with replica set
- **WebSocket Server** - Real-time aircraft positioning
- **Webhook API** - Flight event processing

### API Architecture


#### Authentication & User Management
```
/api/tablet/auth/          - Tablet authentication
/api/install/              - System installation
```

#### Flight Management
```
/api/tablet/add_flight/           - Create new flights
/api/tablet/fetch_flights/        - Retrieve flight logs
/api/tablet/edit_flight/          - Update flight details
/api/tablet/delete_flight/        - Remove flights
/api/tablet/update_flight_notes/  - Add flight notes
```

#### Aircraft & Pilot Management  
```
/api/tablet/fetch_planes/         - Aircraft registry
/api/tablet/fetch_pilots/         - Pilot management
/api/tablet/add_guest_plane/      - Guest aircraft
/api/tablet/private_planes/       - Daily aircraft assignments
```

#### Real-time Data
```
/api/tablet/daily_info/           - Daily operations info
/api/tablet/statistics/           - Flight statistics
/api/tablet/find-current-flight/  - Active flight lookup
```

#### Training & Education
```
/api/tablet/dsvu/                 - Danish flight training modules
```

## 🚀 Features

### Automated Flight Logging
- **Real-time Detection**: Automatic takeoff/landing detection via OGN
- **FLARM Integration**: Direct integration with aircraft transponders  
- **Multi-source Data**: OGN + ADSB data correlation
- **Smart Matching**: Intelligent flight-to-pilot assignment

### Club Management
- **Pilot Registry**: Complete member management with roles
- **Aircraft Fleet**: Registration and maintenance tracking
- **Daily Operations**: Traffic leaders, tow pilots, flight counts
- **Private Aircraft**: Daily assignments and guest plane handling

### Flight Training (DSVU)
- **Complete Curriculum**: All Danish DSVU training modules (G-1 to U-20)
- **Progress Tracking**: Individual student progress monitoring
- **Exercise Logging**: Detailed training exercise completion
- **Instructor Tools**: Evaluation and assessment capabilities

### Analytics & Statistics
- **Flight Metrics**: Duration, distance, altitude, speed analysis
- **Club Statistics**: Activity trends and performance metrics
- **Individual Progress**: Personal flight statistics and achievements
- **Operational Insights**: Daily, weekly, monthly reporting

### Real-time Monitoring
- **Live Aircraft Map**: Real-time positioning of club aircraft
- **Flight Status**: Active flights, pending takeoffs, recent landings
- **WebSocket Updates**: Instant notifications of flight events
- **Activity Dashboard**: Live overview of club operations

## 🐳 Installation & Deployment

### Quick Start with Docker Compose

1. **Clone the repository**
```bash
git clone https://github.com/Kevinvincentals/smartgliding-web.git
cd smartgliding-web
```

2. **Deploy with Docker Compose**
```bash
docker-compose up -d
```

3. **Complete Installation**
- Navigate to `http://your-domain.com/install`
- Follow the on-screen setup wizard
- Create your club, admin user, and register aircraft

### Docker Compose Architecture

The deployment includes:
- **SmartGliding Web** (Port 3000) - Main web application
- **SmartGliding OGN Backend** (Port 8765) - Flight tracking service  
- **MongoDB** (Port 27017) - Database with replica set
- **Watchtower** - Automatic container updates


In the future, a reverse proxy will also be provided - So simply inputting the domain should setup a proxy + SSL. 

### Environment Configuration

Key environment variables:
```env
NODE_ENV=production
DATABASE_URL=mongodb://mongodb:27017/smartgliding?replicaSet=rs0
JWT_SECRET=secret
PLANE_TRACKER_WS_URL=ws://smartgliding-ogn-backend:8765
WEBHOOK_API_KEY=secret
```

## 📱 Tablet Interface

The system includes a specialized tablet interface optimized for use at the airfield:

### Touch-Optimized Design
- Large buttons and controls for easy operation
- Responsive design for various tablet sizes
- Offline-capable for unreliable internet connections

### Key Tablet Features
- Quick flight logging and editing
- Pilot and aircraft selection
- Daily operations management
- Real-time flight monitoring
- Training exercise logging

## ⚙️ Configuration

### Initial Setup via /install

The installation wizard guides you through:

1. **Club Information** - Name, location, contact details, homefield
2. **Admin User** - First administrator account creation
3. **Aircraft Registry** - Initial fleet registration with FLARM IDs
4. **DSVU Catalog** - Automatic population of training modules

### Database Schema

The system automatically populates:
- **DSVU Training Catalog** - Complete Danish training curriculum
- **Airfields Database** - Danish airfield information
- **OGN Device Database** - Aircraft registration data

## 🚧 Current Limitations & Future Work

### Known Limitations
- **Open User Management** - Currently minimal access control
- **No Admin Dashboard** - Command-line database management required
- **Geographic Focus** - Optimized for Danish operations
- **Manual Configuration** - Some settings require database updates
- **Spaghetti Code** - Development speed and feature testing prioritized over clean code architecture

### Code Quality Notes
⚠️ **Development Focus**: This codebase prioritizes rapid feature development and testing over clean architecture. Expect to find:
- Mixed coding patterns and inconsistent structure
- Quick fixes and proof-of-concept implementations
- Limited code documentation and comments
- Technical debt that needs addressing

**Cleanup Planned**: A major code refactoring and cleanup effort is planned for future releases to improve maintainability and code quality.

### Planned Features
- **🔐 Enhanced Authentication** - Proper role-based access control
- **⚙️ Admin Dashboard** - Web-based administration interface
- **🌍 Multi-Country Support** - Configurable geographic regions
- **📧 Notifications** - Email/SMS alerts for club operations
- **📊 Advanced Analytics** - Enhanced reporting and insights
- **🔗 External Integrations** - Weather data, NOTAMs, flight planning

### Security Notes
⚠️ **Important**: This version has minimal security controls. Suitable for internal club networks only. Enhanced authentication is planned for future releases.

## 🔧 Development

### Requirements
- Node.js 18+
- MongoDB with replica set
- Docker & Docker Compose

### Local Development
```bash
npm install
cp .env.example .env.local
# Configure environment variables
npm run dev
```


## 🤝 Contributing

This is an open-source project for the gliding community. Contributions, issues, and feature requests are welcome!

- 🐛 [Report Issues](https://github.com/Kevinvincentals/smartgliding-web/issues)
- 💡 [Feature Requests](https://github.com/Kevinvincentals/smartgliding-web/discussions)
- 🔀 Pull Requests are appreciated

## 🙏 Acknowledgments

- **Open Glider Network (OGN)** - For aircraft tracking data
- **Danish Soaring Association (DSVU)** - For training curriculum standards
- **IGCD Project** - Inspiration for OGN integration patterns

## 📄 License

**MIT License** ✅

```
MIT License

Copyright (c) 2024-2025 Kevin Vincent Als <kevin@connect365.dk>
SmartGliding - Digital tool for soaring clubs

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

*Last updated: June 2025* 
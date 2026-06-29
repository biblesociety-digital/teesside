# bibleconversations.co.uk

A web application for discovering church events in the Teesside area with interactive mapping, postcode search, and event filtering capabilities.

## Features

✅ **Interactive Map** - Leaflet-based map showing all church locations in Teesside
✅ **Postcode Search** - Find churches within a specified radius using UK postcodes
✅ **Event Filtering** - Filter events by age group (18+ / Under 18)
✅ **Radius Search** - Customizable search radius (1-50 miles)
✅ **Admin Panel** - Secure admin area to manage locations and events
✅ **Eventbrite Integration** - Link events directly to Eventbrite listings
✅ **Firebase Firestore Data Storage** - Locations and events load from Google Firebase
✅ **Responsive Design** - Works on desktop, tablet, and mobile devices
✅ **Date Management** - Set start and end dates (removal dates) for events
✅ **Event Statuses** - Events can be active, inactive, or automatically marked over
✅ **Event Detail Pages** - Event cards open clean full-detail pages with venue and booking information
✅ **Material UI Visual Style** - Public and admin screens use Material-style typography, icons, cards, buttons, chips, and forms

## Firebase Data

The map displays whatever locations are stored in the configured Firebase Firestore project. The legacy sample data includes churches across the Teesside area such as:

1. **Stockton Methodist Church** - Stockton-on-Tees
2. **Christ Church Stockton** - Stockton-on-Tees
3. **Middlesbrough Baptist Church** - Middlesbrough
4. **Thornaby Methodist Church** - Thornaby
5. **Billingham St Cuthbert's Church** - Billingham
6. **Redcar Community Church** - Redcar
7. **Hartlepool All Saints Church** - Hartlepool
8. **Eston St Mary's Church** - Eston
9. **Yarm Parish Church** - Yarm
10. **Seaton Carew Methodist Church** - Seaton Carew

## Quick Start

### Opening the Application

1. **For viewing events**: Open `index.html` in a web browser
2. **For admin access**: Open `admin.html` in a web browser
3. Make sure you are online so Leaflet, Firebase, and map tiles can load

### Using the Events Map

1. Enter a UK postcode in the search field (e.g., `TS18 3HJ`)
2. Set your desired search radius (default is 5 miles)
3. Select an age group filter if needed
4. Click "Search" to find events near that location
5. Click on map markers to see location details
6. The homepage shows the next 10 active events, ordered by start date
7. Click on an event card to see the full event details page

### Quick Filters

- **All Events** - Shows the next active events
- **For Adults (18+)** - Shows the next events for 18 years and over
- **For Young People (<18)** - Shows the next events for under 18s

## Admin Panel

### Logging In

1. Go to `admin.html`
2. Sign in with Firebase Authentication using email/password or Google.
3. The bootstrap global admin is `peter.cahill@biblesociety.org.uk`; after first sign-in, the app records that user in `adminUsers`.
4. A `globalAdmin` can manage other admin users from the User administration area.

### Adding a New Location

1. Fill in the location details form with:
   - Location Name (e.g., "St. Mary's Church")
   - Full Address
   - UK Postcode
   - **Interactive Map**: Drag the marker on the map to set the exact location, or click anywhere on the map
   - Latitude & Longitude (these update automatically as you move the marker)
   - Denomination (optional)
   - Contact Number

2. Click "Add Location"

**Finding the Location on the Map:**
- Drag the marker to the church location
- Or click directly on the map at the exact location
- The latitude and longitude fields update automatically
- You can also manually enter coordinates if preferred

### Adding an Event

1. Select a location from the dropdown
2. Fill in the event details:
   - Event Title
   - Description
   - Age Group (18+ or Under 18)
   - Event Status (Active or Inactive)
   - Start Date
   - End Date (when event is removed)
   - Day of Week
   - Time (HH:MM format)
   - Eventbrite URL (optional)

3. Click "Add Event"

### Editing Locations & Events

1. Scroll to "Manage Locations"
2. Click a location to view that location's events
3. Click "Edit" on any location or event
4. Make your changes in the modal
5. Location edits include name, address, postcode, map position, latitude, longitude, denomination, and contact number

### Event Statuses

- **Active** events can appear on the public map until their end date has passed
- **Inactive** events remain in Firebase/admin but are hidden from the public map
- **Over** events have passed their end date; the app marks them as over and hides them from the public map
4. Click "Save Changes"

### Deleting Locations & Events

1. Scroll to "Manage Locations"
2. Click a location to view that location's events
3. Click "Delete" on any location or event
4. Confirm the deletion

## Data Storage

### Current System (Firebase Firestore)

Data is loaded from Google Firebase Firestore. The XML file is no longer used by the public map or admin panel.

Firestore structure:

```text
locations/{locationId}
  name
  address
  postcode
  latitude
  longitude
  denomination
  contact

locations/{locationId}/events/{eventId}
  title
  description
  ageGroup
  startDate
  endDate
  dayOfWeek
  time
  eventbriteUrl
  active
  status
```

The admin panel writes to the same Firestore collections that the public map reads from.

## Security Considerations

⚠️ **This is a client-side application** - it's not suitable for sensitive data without additional security measures:

1. **Enable Firebase Authentication** providers for Email/Password and/or Google
2. **Bootstrap global admin** is hard-coded as `peter.cahill@biblesociety.org.uk`; sign in once with that registered Firebase Auth user
3. **Deploy Firestore security rules** from `firestore.rules` so only authorised users can write
4. **Use HTTPS** when deploying
5. **Validate all inputs** on both client and server side
6. **Implement proper access control** for who can edit/delete

## Browser Compatibility

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Technologies Used

- **HTML5** - Page structure
- **CSS3** - Responsive styling
- **JavaScript (ES6)** - Application logic
- **Leaflet.js** - Interactive mapping
- **OpenStreetMap** - Map tiles
- **Firebase Firestore** - Cloud data persistence

## File Structure

```
events-map-site/
├── index.html              - Main public view page
├── admin.html              - Admin panel
├── css/
│   └── styles.css          - Responsive styling
├── js/
│   ├── app.js              - Main app logic (map, search, filtering)
│   ├── admin.js            - Admin panel functionality
│   └── utils.js            - Shared utilities and data handling
├── data/
│   └── events.xml          - Legacy sample data (not loaded by the app)
└── README.md               - This file
```

## Future Enhancements

- [ ] Firebase Authentication
- [ ] Stricter role-based admin permissions
- [ ] Event calendar view
- [ ] Photo/image support
- [ ] Rating and review system
- [ ] Email notifications for new events
- [ ] Integration with Google Calendar
- [ ] Mobile app version
- [ ] Multi-language support
- [ ] Search by denomination

## Adding More Teesside Churches

To find and add more churches in the Teesside area:

1. **Search resources**:
   - Church of England locator: https://www.churchofengland.org/find-a-church
   - UK Churches directory: https://www.ukirchesdirectory.org.uk/
   - Open Street Map: https://www.openstreetmap.org/
   - Local council websites

2. **Collect the following information**:
   - Church name
   - Full address with postcode
   - Denomination
   - Contact phone number
   - Latitude & Longitude (use Google Maps or OSM)

3. **Add to admin panel** using the location form

## Troubleshooting

### Map not loading
- Check that you have internet connection (for map tiles)
- Verify Leaflet CDN is accessible
- Check browser console for errors

### Events not showing
- Verify events have start dates before today and end dates after today
- Check the age group filter is set correctly
- Ensure location has valid coordinates

### Data not saving
- Check Firebase is reachable
- Check Firestore security rules allow the current write
- Check browser console for Firebase permission or network errors

### Postcode search not working
- Verify postcode is in correct UK format
- Try a wider search radius
- Check that locations have been added to the system

## Support

For issues or feature requests, please document:
1. What you were trying to do
2. What happened
3. Browser and OS version
4. Any error messages from browser console

## License

This application is built for the Teesside BEC and church community use.

---

**Last Updated**: May 2026
**Version**: 1.0

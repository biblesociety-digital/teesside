# Quick Start Guide - bibleconversations.co.uk

## 🚀 Getting Started (30 seconds!)

### Step 1: Open the Application
1. Navigate to your project folder: `Teesside BEC - Primary\events-map-site`
2. **For viewing events**: Double-click `index.html`
3. **For admin access**: Double-click `admin.html`
4. Make sure you are online so Firebase, Leaflet, and map tiles can load

### Step 2: View Events (Public Users)
- The map shows all church locations in Teesside
- The homepage shows the next 10 active events by start date
- Click on a map marker to see churches and their events
- Use the search bar to find events near a postcode
- Filter by age group (Adults 18+ or Under 18)
- Click an event card to open its full details page
- Use the Eventbrite button on the details page if the event has a booking link

### Step 3: Manage Events (Admin Users)

#### Logging In
1. Open `admin.html`
2. Sign in with Firebase Authentication using email/password or Google
3. The initial global admin is `peter.cahill@biblesociety.org.uk`
   - Use `role: "globalAdmin"` for users who can manage other admins
   - Use `role: "admin"` for users who can manage event content only

#### Adding a Church Location
1. Fill in "Add New Location" form:
   - Name (e.g., "St. Michael's Church")
   - Full address
   - Postcode (e.g., TS1 2AB)
   - **📍 Use the map to set location**:
     - Drag the marker to the exact church location, OR
     - Click on the map to place the marker
   - Latitude & Longitude (auto-updates as you move the marker)
   - Denomination
   - Contact number
2. Click "Add Location"

**No need to manually look up coordinates!** Just use the interactive map.

#### Adding an Event
1. Select a church location from dropdown
2. Fill in event details:
   - Title (e.g., "Youth Group")
   - Description
   - Age group (18+ or Under 18)
   - Status (Active or Inactive)
   - Start & End dates
   - Day of week
   - Time (e.g., 19:00)
   - Eventbrite URL (optional)
3. Click "Add Event"

#### Editing or Deleting
1. Scroll down to "Manage Locations"
2. Click a location to see only that location's events
3. Click "Edit" to modify details
4. Click "Delete" to remove (confirm when prompted)

## 📍 Firebase Locations

The map displays the locations stored in the configured Firebase Firestore project. If Firebase is empty, add churches through the admin panel. The legacy sample list includes:

1. Stockton Methodist Church (TS18 3HJ)
2. Christ Church Stockton (TS18 1TH)
3. Middlesbrough Baptist Church (TS1 2PF)
4. Thornaby Methodist Church (TS17 6SJ)
5. Billingham St Cuthbert's Church (TS23 1LF)
6. Redcar Community Church (TS10 1DJ)
7. Hartlepool All Saints Church (TS24 7EA)
8. Eston St Mary's Church (TS6 9NT)
9. Yarm Parish Church (TS15 9AU)
10. Seaton Carew Methodist Church (TS25 1AE)

## 🛠️ To Add More Churches

Contact your church and gather:
- [ ] Church name
- [ ] Full address with postcode
- [ ] Denomination
- [ ] Phone number
- [ ] Latitude & Longitude (use Google Maps)

Then use the admin panel to add them!

## 🔒 Security Notes

- Enable Email/Password and/or Google providers in Firebase Authentication
- Sign in once as `peter.cahill@biblesociety.org.uk` to bootstrap the first global admin record
- Deploy the Firestore rules from `firestore.rules`
- Use the admin page's User administration area for ongoing access changes

## 📱 Features Included

✅ Interactive map showing all churches
✅ UK postcode search (Teesside area)
✅ Radius search (1-50 miles)
✅ Filter by age group
✅ Event dates with automatic removal dates
✅ Clickable event cards with full event detail pages
✅ Eventbrite integration
✅ Fully responsive (works on mobile, tablet, desktop)
✅ Firebase-backed data shared across devices

## 🆘 Troubleshooting

**Map not showing?**
- Make sure you have internet connection
- Try refreshing the page

**Events not appearing?**
- Check event start date is today or earlier
- Check event end date is today or later
- Verify age group filter matches

**Can't add events?**
- Make sure you selected a location first
- Check all required fields are filled
- Look for error messages

**Need to see the data?**
- Open the Firebase console for the configured project
- Locations are in `locations`; events are in each location's `events` subcollection

## 📞 Adding Events to an Existing Church

1. Go to admin.html (login if needed)
2. Select the church from "Add New Event" dropdown
3. Fill in event details and save
4. Events appear on map and in event lists immediately

## 🔄 Your Data

All locations and events are stored in Google Firebase Firestore. Changes made in the admin panel are shared with other users who can read the same Firebase project.

## 💡 Tips

- Events automatically hide when end date passes
- Passed events are marked as Over and hidden from the public map
- Inactive events stay in admin/Firebase but do not show publicly
- You can edit dates to control when events appear/disappear
- Multiple events can happen at the same location
- Search radius helps find nearby churches
- Age groups help tailor events for your audience

---

**Need help?** See README.md for full documentation

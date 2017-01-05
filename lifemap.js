

var GOOGLE_MAPS_API_KEY = "AIzaSyDQ2Yegx9qTU-Xmmy84TMWg8lNGYLdRcWY";
var GOOGLE_MAPS_API_DELAY_MS = 200;
var COLORS = ["#ffafaf","#b8afff","#ffafe0","#afefff","#feafff","#afffdc","#c6ffaf","#fcffaf","#ffdcaf"];

	
var _map = null;
var _geocoder = null;
var _infoWindow = null;
var _events = [];
var _eventProcessQueue = [];
var _lastHomeLocation = null;
var _geocoderCache = {};
var _colorIndex = 0;
var _heatmap = null;
var _heatmapData = null;
var _processCount = 0;
var _lines = [];
var _markers = [];
var _showLines = true;
var _showMarkers = true;
var _showHeatmap = true;
var _filterShowHomes = true;
var _filterShowTrips = true;

function info(msg) {
	$("#info").text(msg);
}

function updateUI() {
	if(_showHeatmap == true) $("#tools .button.heatmap").addClass("selected");
	else $("#tools .button.heatmap").removeClass("selected");
	if(_showMarkers == true) $("#tools .button.markers").addClass("selected");
	else $("#tools .button.markers").removeClass("selected");
	if(_showLines == true) $("#tools .button.lines").addClass("selected");
	else $("#tools .button.lines").removeClass("selected");
	if(_filterShowHomes == true) $("#filters .button.homes").addClass("selected");
	else $("#filters .button.homes").removeClass("selected");
	if(_filterShowTrips == true) $("#filters .button.trips").addClass("selected");
	else $("#filters .button.trips").removeClass("selected");
}

function toggleHeatmap() {
	_showHeatmap = !_showHeatmap;
	if(_showHeatmap) _heatmap.setMap(_map);
	else _heatmap.setMap(null);
	updateUI();
}

function updateMarkers() {
	for(var i = 0; i < _markers.length; i++) {
		var map = _showMarkers == true ? _map : null;
		if(_filterShowHomes == false && _markers[i].category == "home") map = null;
		if(_filterShowTrips == false && _markers[i].category == "trip") map = null;
		_markers[i].setMap(map);
	}
}

function toggleMarkers() {
	_showMarkers = !_showMarkers;
	updateMarkers();
	updateUI();
}

function toggleHomes() {
	_filterShowHomes = !_filterShowHomes;
	updateMarkers();
	updateLines();
	updateUI();
}

function toggleTrips() {
	_filterShowTrips = !_filterShowTrips;
	updateMarkers();
	updateLines();
	updateUI();
}

function updateLines() {
	for(var i = 0; i < _lines.length; i++) {
		var map = _showLines == true ? _map : null;
		if(_filterShowHomes == false && _lines[i].category == "home") map = null;
		if(_filterShowTrips == false && _lines[i].category == "trip") map = null;
		_lines[i].setMap(map);
	}
}

function toggleLines() {
	_showLines = !_showLines;
	updateLines();
	updateUI();
}
	
function getUniqueColor() {
	var color = COLORS[_colorIndex];
	_colorIndex++;
	if(_colorIndex >= COLORS.length) _colorIndex = 0;
	return color;
}

function _pinSymbol(color) {
    return {
        path: 'M 0,0 C -2,-20 -10,-22 -10,-30 A 10,10 0 1,1 10,-30 C 10,-22 2,-20 0,0 z',
        fillColor: color,
        fillOpacity: 1,
        strokeColor: '#000',
        strokeWeight: 1,
        scale: 1,
        labelOrigin: new google.maps.Point(0,-29)
    };
}

function _lineSymbol() {
	return {
	  path: 'M 0,-1 0,1',
	  strokeOpacity: 1,
	  scale: 4
	}
}

function _arrowSymbol() {
	return {
	  path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
	  strokeOpacity: 1,
	  scale: 3
	}
}

function getLatLngFromString(ll) {
	//console.log("latlon convert "+ll);
    var latlng = ll.split(',')
    return new google.maps.LatLng(parseFloat(latlng[0]), parseFloat(latlng[1])); 
}

function addGeodesicLine(start,end,color,type) {
	var icons = [];
	var strokeOpacity = 1.0;
	if(type == "trip") {
		icons.push({
		    icon: _lineSymbol(),
			offset: '0',
		    repeat: '20px'
		});
		strokeOpacity = 0.0;
	}
	icons.push({
		icon: _arrowSymbol(),
		offset: '100%'
	});
	var poly = new google.maps.Polyline({
		strokeColor: color,
		strokeOpacity: strokeOpacity,
		strokeWeight: 3,
		geodesic: true,
		map: _showLines==true?_map:null,
		path: [start, end],
		icons: icons
	});
	poly.category = type;
	_lines.push(poly);
}

function _getHomeForDate(date) {
	for(var i = 0; i < _events.length; i++) {
		var event = _events[i];
		if(event.category == "home" && date >= event.start && date <= event.end) return event;
	}
	return null;
}

function _getTripsForHome(home) {
	var trips = [];
	for(var i = 0; i < _events.length; i++) {
		var event = _events[i];
		if(event.category == "trip" && event.start >= home.start && event.end <= home.end) trips.push(event);
	}
	return trips;
}

function _getDateString(date) {
	return date.toISOString().slice(0, 10);
}

function _registerEventWithLocation(event,location) {
	// Setup dates
	if(event.start == null && event.end == null) {
		event.start = event.date;
		event.end = event.date;
	}
	if(event.start != null) event.start = new Date(event.start);
	if(event.end != null) event.end = new Date(event.end);


	// Create trajectory
	var markerColor = "#FF0000"; //fallback
	if(event.category == "home") {
		// Add line from last home
		if(_lastHomeLocation != null) addGeodesicLine(_lastHomeLocation,location,"#000000","home");
		_lastHomeLocation = location;
		// Set color
		event.color = getUniqueColor();
	}
	if(event.category == "trip") {
		// Find matching home
		var home = _getHomeForDate(event.start);
		event.home = home;
		if(home != null) {
			addGeodesicLine(home.latlon,location,home.color,"trip");
			event.color = home.color;
		} else {
			alert("Could not find home for event '"+event.title+"': "+JSON.stringify(event));
		}
	}

	// Create marker
	var marker = new google.maps.Marker({
		position: location,
		map: _showMarkers==true?_map:null,
		title: event.title,
		label: event.title,
		icon: _pinSymbol(event.color)
	});
	marker.category = event.category;
	_markers.push(marker);
	marker.addListener('click', function() {
		var contentString = '';
        contentString += '<h1>'+event.title+'</h1>';
        if(_getDateString(event.start) == _getDateString(event.end)) contentString += '<p><b>'+_getDateString(event.start)+'</b></p>';
        else contentString += '<p><b>'+_getDateString(event.start)+' - '+_getDateString(event.end)+'</b></p>';
        if(event.location!=null) contentString+='<p>'+event.location+'</p>';
        if(event.description!=null) contentString+='<p>'+event.description+'</p>';
        if(event.comments!=null) contentString+='<p>'+event.comments+'</p>';
        if(event.category == "home") {
        	var trips = _getTripsForHome(event);
        	contentString+='<p><b>Trips:</b></p>';
        	for(var i = 0; i < trips.length; i++) {
        		contentString+='<p>'+trips[i].title+' ('+_getDateString(trips[i].start)+')</p>';
        	}
        }
        if(event.category == "trip") {
        	contentString+='<p>While living in '+event.home.title+'</p>';
        }
        contentString+='<p><a href="https://www.google.com/maps/search/'+event.latlon+'" target="_blank">Open Map</a></p>';
        '';
		_infoWindow = new google.maps.InfoWindow({
        	content: contentString
        });
      	_infoWindow.open(_map, marker);
    });

    // Register in heatmap
    _heatmapData.push({location:location, weight: 1});
}


function processEvent(event,callback) {
	console.log("Processing "+event.title);
    if(event.latlon != null) {
		// Convert to location struct
		event.latlon = getLatLngFromString(event.latlon);
		_registerEventWithLocation(event,event.latlon);
		callback();
	} else {
		var address = event.location;
		if(address == null) address = event.title;
		// Cached?
		if(_geocoderCache[address] != null) {
			event.latlon = _geocoderCache[address];
			_registerEventWithLocation(event,event.latlon);
			callback();
		} else {
			// Ask google
			_geocoder.geocode( { 'address': address}, function(results, status) {
                 if (status == google.maps.GeocoderStatus.OK) {
					_geocoderCache[address] = results[0].geometry.location;
					event.latlon = results[0].geometry.location;
                    _registerEventWithLocation(event,event.latlon);
					callback();
                 } else {
					// Limit?
					if(status == "OVER_QUERY_LIMIT") {
						// Schedule a retry
						info("Waiting for Google...");
						setTimeout(function(){
							processEvent(event,callback);
						},2000);
					} else {
                    	alert('Geocode was not successful for '+event.title+' address '+address+' the following reason: ' + status);
						callback();
					}
                 }
            });
		}
	}
}
function registerEvent(event) {
	_events.push(event);
	_eventProcessQueue.push(event);
}
function processEvents() {
	var event = _eventProcessQueue.shift();
	if(event == null) {
		info("Map Loaded");
		return;
	}
	setTimeout(function(){
		_processCount++;
		info("Processsing "+_processCount + "/"+_events.length);
		processEvent(event,processEvents);
	},GOOGLE_MAPS_API_DELAY_MS);
}

function initMap() {
    // Init google maps
    _geocoder = new google.maps.Geocoder();
    _map = new google.maps.Map(document.getElementById('map'), {
		zoom: 2,
		center: {lat: 22.049065, lng: 10.922522},
		mapTypeId: 'terrain',
		styles: MAP_STYLES.silver
    });

	// Info window
	_infoWindow = new google.maps.InfoWindow({
      content: null
    });

	// Info
	var info = document.getElementById('info');
	_map.controls[google.maps.ControlPosition.RIGHT_TOP].push(info);

	// Tools
	var tools = document.getElementById('tools');
	_map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(tools);

	// Filters
	var filters = document.getElementById('filters');
	_map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(filters);

	// Heatmap
	_heatmapData = new google.maps.MVCArray();
	_heatmap = new google.maps.visualization.HeatmapLayer({
	  	data: _heatmapData,
	  	dissipating: false,
	  	radius: 10
	});
	_heatmap.setMap(_map);

    // Init all data
    initData();
	processEvents();
	updateUI();
}




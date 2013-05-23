var fbMap={}
fbMap.API_KEY = "0826ae9d2c064f8c8582859abf50f7d6"
fbMap.PAGE_SIZE = 100;
fbMap.MAX_RESULTS = 500;

fbMap.template= "https://www.googleapis.com/freebase/v1/search" 
//    + "?filter=(all type:/travel/tourist_attraction (within radius:{2} lat:{0} lon:{1}))"
    + "?filter=(all (within radius:{2} lat:{0} lon:{1}))"
    + "&output=(geocode%20description)"
//fbMap.sorted_template=fbMap.template+"&sort_by_pin={0},{1}&sort_by=sourceResource.spatial.coordinates";
fbMap.firstDraw = true;
fbMap.skipLookup = false;
fbMap.markers={};

if (!String.prototype.format) {
  String.prototype.format = function() {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function(match, number) { 
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
      ;
    });
  };
}

function main() {
    if (Modernizr.geolocation) {
        navigator.geolocation.getCurrentPosition(makeMap);
    } else {
        displayError();
    }
}

function makeMap(position) {
    var lat = parseFloat(position.coords.latitude);
    var lon = parseFloat(position.coords.longitude);
    var loc = new google.maps.LatLng(lat, lon);

    var opts = {
        zoom: getZoom() - 2,
        center: loc,
        mapTypeId: google.maps.MapTypeId.ROADMAP
    };

    fbMap.map = new google.maps.Map(document.getElementById("map_canvas"), opts);
    fbMap.oms = new OverlappingMarkerSpiderfier(fbMap.map, {markersWontMove: true, markersWontHide: true});
    var info = new google.maps.InfoWindow();
    fbMap.oms.addListener('click', function(marker) {
	console.log('Click');
	info.setContent(marker.desc);
	info.open(fbMap.map, marker);
    });
    var marker = new google.maps.Marker({
        map: fbMap.map,
        position: loc,
        icon: getCenterpin(),
        title: 'Current Location',
    });

    google.maps.event.addListener(fbMap.map, 'idle', lookupTopics);
    google.maps.event.addListener(fbMap.map, 'bounds_changed', cancelLookup);
}

function lookupTopics() {
    if (fbMap.skipLookup) {
	fbMap.skipLookup = false;
	return;
    }
    fbMap.count = 0;
    fbMap.page = 0;
    var center = fbMap.map.getCenter();
    fbMap.lat = center.jb;
    fbMap.lon = center.kb;

    var mapBounds = fbMap.map.getBounds();
    var sw = mapBounds.getSouthWest();
    var ne = mapBounds.getNorthEast();
    var nw = new google.maps.LatLng(ne.lat(), sw.lng());
    // assumes map wider than tall
    var lonWidth = google.maps.geometry.spherical.computeDistanceBetween(ne, nw)
    fbMap.radius = parseInt(lonWidth / 2 / 1000) + "km";

    clearMarkers(mapBounds);
    fbMap.markerBounds = new google.maps.LatLngBounds();
    lookupByLocation(fbMap.lat,fbMap.lon,fbMap.radius,fbMap.page,true);
}

function lookupByLocation(lat,lon,radius,page,sorted) {
    url = fbMap.template.format(lat,lon,radius,page)
//    if (sorted) {
//	url = fbMap.sorted_template.format(lat,lon,radius,page)
//    }
    console.log("fetching results from Freebase: " + url);
    fbMap.ajaxRequest = $.ajax({url: url, dataType: "jsonp", success: displayResults});
}

function cancelLookup() {
    if (fbMap.ajaxRequest) {
	fbMap.ajaxRequest.abort();
    }
}

function clearMarkers(mapBounds) {
    var markers = fbMap.oms.getMarkers();
    for (var i=0; i < markers.length; i++) {
	var marker = markers[i];
	// Remove any markers outside our map bounds
	if (!mapBounds.contains(marker.getPosition())) {
	    marker.setMap(null);
	    fbMap.oms.removeMarker(marker);
	    delete fbMap.markers[marker.dplaId];
	}
    }
}

function displayResults(data) {
    var done = true;
    if (!fbMap.firstDraw && data.result.length == fbMap.PAGE_SIZE 
	  && fbMap.count < fbMap.MAX_RESULTS - fbMap.PAGE_SIZE) {
	fbMap.page += 1;
	lookupByLocation(fbMap.lat,fbMap.lon,fbMap.radius,fbMap.page, true);
	done = false;
    }
    $.each(data.result, displayResult);
    console.log('Points mapped: ' + fbMap.count);
    if (done && fbMap.firstDraw) {
	fbMap.firstDraw = false;
	// No need to refresh on next idle because we caused zoom change
	fbMap.skipLookup = true;
	fbMap.map.fitBounds(fbMap.markerBounds);
	console.log('Zoomed to bounds');
    }
}

function displayResult(index, result) {
    fbMap.count += 1;
    if (result.id in fbMap.markers) {
	return;
    }

    var geocode = result.output.geocode["/location/location/geolocation"][0]
    var lat = parseFloat(geocode.latitude);
    var lon = parseFloat(geocode.longitude);
    var loc = new google.maps.LatLng(lat, lon);


    // create a marker for the subject
    if (loc) {
	    var title = result.name;
	    var description = '';
	    if ('description' in result.output && 'wikipedia' in result.output.description) {
                 description = result.output.description[0];
            }

            var icon = getPushpin();

            // TODO: Choose marker based on type of resource
            var marker = new google.maps.Marker({
                map: fbMap.map,
                icon: icon,
                position: loc,
		title: title,
            });

	    // No link to the record included.  What a pain in the butt! Make our own
	    var recordUrl = 'http://www.freebase.com/'+result.mid;
            var viewUrl = 'http://www.freebase.com/'+result.mid;

            // add a info window to the marker so that it displays when 
            // someone clicks on the marker
	    var provider = 'Freebase';
            var item = '<a target="_new" href="' + recordUrl + '">' + title + '</a>';
            provider = '<a target="_new" href="' + viewUrl + '">' + provider + '</a>.';
            var html = '<span class="map_info">' + item +' from ' + provider + ' '+description+'</span>';
	    marker.desc = html;
            marker.dplaId = result.id;
            fbMap.markers[result.id] = marker;
	    fbMap.oms.addMarker(marker);
	    fbMap.markerBounds.extend(marker.getPosition());
        }
}

function displayError() {
    html = "<p class='error'>Your browser doesn't seem to support the HTML5 geolocation API. You will need either: Firefox (3.5+), Safari (5.0+) Chrome (5.0+), Opera (10.6+), iPhone (3.0+) or Android (2.0+). Sorry!</p>";
    $("#subject_list").replaceWith(html);
}

function getPushpin() {
    return getPin("http://maps.google.com/mapfiles/kml/pushpin/red-pushpin.png");
}

function getCenterpin() {
    return getPin("http://maps.google.com/mapfiles/kml/pushpin/blue-pushpin.png");
}

function getPin(url) {
    if (is_handheld()) {
        size = 84;
    } else {
        size = 30;
    }
    return new google.maps.MarkerImage(url, new google.maps.Size(64, 64), new google.maps.Point(0, 0), new google.maps.Point(0, size), new google.maps.Size(size, size));
}

function getZoom() {
    if (is_handheld()) {
        return 15;
    } else {
        return 12;
    }
}

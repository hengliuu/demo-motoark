package fitment

type fitmentQuery struct {
	Part string `form:"part"`
	VIN  string `form:"vin"`
}

type fitmentResponse struct {
	Result   string            `json:"result"`
	Vehicle  vehicleResponse   `json:"vehicle"`
	Part     partResponse      `json:"part"`
	Resolved resolvedResponse  `json:"resolved"`
	Listings []listingResponse `json:"listings"`
}

type vehicleResponse struct {
	VIN     string `json:"vin"`
	Make    string `json:"make"`
	Model   string `json:"model"`
	Chassis string `json:"chassis"`
	Year    int    `json:"year"`
}

type partResponse struct {
	Number string `json:"number"`
	Name   string `json:"name"`
}

type resolvedResponse struct {
	Number string   `json:"number"`
	Name   string   `json:"name"`
	Chain  []string `json:"chain"`
}

type listingResponse struct {
	ID           string `json:"id"`
	Yard         string `json:"yard"`
	Grade        string `json:"grade"`
	PriceAED     int    `json:"price_aed"`
	WarrantyDays int    `json:"warranty_days"`
	Delivery     string `json:"delivery"`
}

func toFitmentResponse(r Result) fitmentResponse {
	listings := make([]listingResponse, 0, len(r.Listings))
	for _, l := range r.Listings {
		listings = append(listings, listingResponse{
			ID: l.ID, Yard: l.Yard, Grade: l.Grade,
			PriceAED: l.PriceAED, WarrantyDays: l.WarrantyDays, Delivery: l.Delivery,
		})
	}
	return fitmentResponse{
		Result:   string(r.Status),
		Vehicle:  vehicleResponse(r.Vehicle),
		Part:     partResponse(r.Part),
		Resolved: resolvedResponse(r.Resolved),
		Listings: listings,
	}
}

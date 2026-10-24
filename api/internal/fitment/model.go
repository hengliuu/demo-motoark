package fitment

type Status string

const (
	StatusFits       Status = "fits"
	StatusSuperseded Status = "superseded"
	StatusNoFit      Status = "no_fit"
)

type Vehicle struct {
	VIN     string
	Make    string
	Model   string
	Chassis string
	Year    int
}

type Part struct {
	Number       string
	Name         string
	Chassis      string
	SupersededBy string
}

type Listing struct {
	ID           string
	PartNumber   string
	Yard         string
	Grade        string
	PriceAED     int
	WarrantyDays int
	Delivery     string
}

type PartRef struct {
	Number string
	Name   string
}

type Resolved struct {
	Number string
	Name   string
	Chain  []string
}

type Result struct {
	Status   Status
	Vehicle  Vehicle
	Part     PartRef
	Resolved Resolved
	Listings []Listing
}

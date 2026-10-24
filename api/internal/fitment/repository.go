package fitment

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
)

type Repository interface {
	FindVehicle(ctx context.Context, vin string) (Vehicle, error)
	FindPart(ctx context.Context, number string) (Part, bool)
	ListListings(ctx context.Context, partNumber string) []Listing
}

//go:embed seed.json
var seedJSON []byte

type seedRepository struct {
	vehicles map[string]Vehicle
	parts    map[string]Part
	listings map[string][]Listing
}

type seedFile struct {
	Vehicles []struct {
		VIN     string `json:"vin"`
		Make    string `json:"make"`
		Model   string `json:"model"`
		Chassis string `json:"chassis"`
		Year    int    `json:"year"`
	} `json:"vehicles"`
	Parts []struct {
		Number       string `json:"number"`
		Name         string `json:"name"`
		Chassis      string `json:"chassis"`
		SupersededBy string `json:"superseded_by"`
	} `json:"parts"`
	Listings []struct {
		ID           string `json:"id"`
		PartNumber   string `json:"part_number"`
		Yard         string `json:"yard"`
		Grade        string `json:"grade"`
		PriceAED     int    `json:"price_aed"`
		WarrantyDays int    `json:"warranty_days"`
		Delivery     string `json:"delivery"`
	} `json:"listings"`
}

func NewSeedRepository() (Repository, error) {
	var f seedFile
	if err := json.Unmarshal(seedJSON, &f); err != nil {
		return nil, fmt.Errorf("parse fitment seed: %w", err)
	}
	r := &seedRepository{
		vehicles: map[string]Vehicle{},
		parts:    map[string]Part{},
		listings: map[string][]Listing{},
	}
	for _, v := range f.Vehicles {
		r.vehicles[v.VIN] = Vehicle{VIN: v.VIN, Make: v.Make, Model: v.Model, Chassis: v.Chassis, Year: v.Year}
	}
	for _, p := range f.Parts {
		r.parts[p.Number] = Part{Number: p.Number, Name: p.Name, Chassis: p.Chassis, SupersededBy: p.SupersededBy}
	}
	for _, l := range f.Listings {
		r.listings[l.PartNumber] = append(r.listings[l.PartNumber], Listing{
			ID: l.ID, PartNumber: l.PartNumber, Yard: l.Yard, Grade: l.Grade,
			PriceAED: l.PriceAED, WarrantyDays: l.WarrantyDays, Delivery: l.Delivery,
		})
	}
	return r, nil
}

func (r *seedRepository) FindVehicle(_ context.Context, vin string) (Vehicle, error) {
	v, ok := r.vehicles[vin]
	if !ok {
		return Vehicle{}, ErrUnknownVIN
	}
	return v, nil
}

func (r *seedRepository) FindPart(_ context.Context, number string) (Part, bool) {
	p, ok := r.parts[number]
	return p, ok
}

func (r *seedRepository) ListListings(_ context.Context, partNumber string) []Listing {
	return append([]Listing(nil), r.listings[partNumber]...)
}

package fitment

import (
	"context"
	"errors"
	"slices"
	"testing"
)

const seedVIN = "WDD2050421R123456"

type fakeRepo struct {
	parts map[string]Part
}

func (f fakeRepo) FindVehicle(context.Context, string) (Vehicle, error) {
	return Vehicle{}, ErrUnknownVIN
}

func (f fakeRepo) FindPart(_ context.Context, n string) (Part, bool) {
	p, ok := f.parts[n]
	return p, ok
}

func (f fakeRepo) ListListings(context.Context, string) []Listing { return nil }

func seedService(t *testing.T) *Service {
	t.Helper()
	repo, err := newSeedRepository()
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	return New(repo)
}

func TestNormalizePart(t *testing.T) {
	s := New(fakeRepo{})
	for _, in := range []string{"A 205 906 22 03", "a2059062203", "A-205.906.22.03"} {
		t.Run("MOTO-01-TC04 normalises "+in, func(t *testing.T) {
			got, err := s.NormalizePart(in)
			if err != nil || got != "A2059062203" {
				t.Fatalf("got %q, %v", got, err)
			}
		})
	}
	for _, in := range []string{"", " - . ", "A205/9062203"} {
		t.Run("MOTO-01-TC15 rejects "+in, func(t *testing.T) {
			if _, err := s.NormalizePart(in); !errors.Is(err, ErrInvalidPart) {
				t.Fatalf("got %v", err)
			}
		})
	}
}

func TestValidateVIN(t *testing.T) {
	s := New(fakeRepo{})
	for _, in := range []string{"WDD2050421R12345I", "WDD2050421R12345O", "WDD2050421R12345Q", "WDD2050421R12345", "WDD2050421R1234567"} {
		t.Run("MOTO-01-TC18 rejects "+in, func(t *testing.T) {
			if _, err := s.ValidateVIN(in); !errors.Is(err, ErrInvalidVIN) {
				t.Fatalf("got %v", err)
			}
		})
	}
	t.Run("MOTO-01-TC17 trims and uppercases a valid VIN", func(t *testing.T) {
		got, err := s.ValidateVIN("  wdd2050421r123456 ")
		if err != nil || got != seedVIN {
			t.Fatalf("got %q, %v", got, err)
		}
	})
}

func TestResolveSupersession(t *testing.T) {
	t.Run("MOTO-01-TC08 a supersession cycle stops at 5 hops", func(t *testing.T) {
		s := New(fakeRepo{parts: map[string]Part{
			"A": {Number: "A", SupersededBy: "B"},
			"B": {Number: "B", SupersededBy: "A"},
		}})
		_, chain, err := s.ResolveSupersession(context.Background(), "A")
		if err != nil {
			t.Fatal(err)
		}
		if hops := len(chain) - 1; hops != 5 {
			t.Fatalf("hops = %d, chain %v", hops, chain)
		}
	})
	t.Run("MOTO-01-TC02 follows a chain to the newest number", func(t *testing.T) {
		s := seedService(t)
		got, chain, err := s.ResolveSupersession(context.Background(), "A2059062203")
		if err != nil || got != "A2059065903" || !slices.Equal(chain, []string{"A2059062203", "A2059065903"}) {
			t.Fatalf("got %q %v %v", got, chain, err)
		}
	})
}

func TestCheck(t *testing.T) {
	ctx := context.Background()
	s := seedService(t)

	t.Run("MOTO-01-TC01 a fitting part fits", func(t *testing.T) {
		r, err := s.Check(ctx, CheckParams{Part: "A0004204102", VIN: seedVIN})
		if err != nil {
			t.Fatal(err)
		}
		if r.Status != StatusFits || r.Vehicle.Chassis != "W205" || r.Resolved.Number != "A0004204102" || len(r.Resolved.Chain) != 1 {
			t.Fatalf("got %+v", r)
		}
		var prices []int
		for _, l := range r.Listings {
			prices = append(prices, l.PriceAED)
		}
		if !slices.Equal(prices, []int{899, 1250, 1480}) {
			t.Fatalf("prices %v", prices)
		}
	})

	t.Run("MOTO-01-TC02 a superseded part resolves to the new number", func(t *testing.T) {
		r, err := s.Check(ctx, CheckParams{Part: "a 205 906 22 03", VIN: seedVIN})
		if err != nil {
			t.Fatal(err)
		}
		if r.Status != StatusSuperseded || r.Part.Number != "A2059062203" || r.Resolved.Number != "A2059065903" ||
			!slices.Equal(r.Resolved.Chain, []string{"A2059062203", "A2059065903"}) {
			t.Fatalf("got %+v", r)
		}
		if len(r.Listings) != 2 || r.Listings[0].ID != "L-2001" || r.Listings[1].ID != "L-2002" {
			t.Fatalf("listings %+v", r.Listings)
		}
	})

	t.Run("MOTO-01-TC03 a part for another chassis does not fit", func(t *testing.T) {
		r, err := s.Check(ctx, CheckParams{Part: "A1669060103", VIN: seedVIN})
		if err != nil {
			t.Fatal(err)
		}
		if r.Status != StatusNoFit || r.Listings == nil || len(r.Listings) != 0 {
			t.Fatalf("got %+v", r)
		}
	})

	t.Run("MOTO-01-TC14 a part outside the catalogue is no fit with an empty name", func(t *testing.T) {
		r, err := s.Check(ctx, CheckParams{Part: "Z9999999999", VIN: seedVIN})
		if err != nil {
			t.Fatal(err)
		}
		if r.Status != StatusNoFit || r.Part.Number != "Z9999999999" || r.Resolved.Name != "" || r.Listings == nil || len(r.Listings) != 0 {
			t.Fatalf("got %+v", r)
		}
	})

	t.Run("MOTO-01-TC07 an unknown VIN returns ErrUnknownVIN", func(t *testing.T) {
		if _, err := s.Check(ctx, CheckParams{Part: "A0004204102", VIN: "WDD2050421R999999"}); !errors.Is(err, ErrUnknownVIN) {
			t.Fatalf("got %v", err)
		}
	})

	t.Run("MOTO-01-TC06 Check rejects a VIN with an excluded letter", func(t *testing.T) {
		if _, err := s.Check(ctx, CheckParams{Part: "A0004204102", VIN: "WDD2050421R12345O"}); !errors.Is(err, ErrInvalidVIN) {
			t.Fatalf("vin: %v", err)
		}
	})

	t.Run("MOTO-01-TC15 Check rejects a blank part number", func(t *testing.T) {
		if _, err := s.Check(ctx, CheckParams{Part: " ", VIN: seedVIN}); !errors.Is(err, ErrInvalidPart) {
			t.Fatalf("part: %v", err)
		}
	})
}

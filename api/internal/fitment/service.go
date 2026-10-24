package fitment

import (
	"cmp"
	"context"
	"slices"
	"strings"
)

// maxSupersessionHops bounds the walk so a cycle in the catalogue cannot loop forever (FSD AC07).
const maxSupersessionHops = 5

type Service struct {
	repo Repository
}

func New(repo Repository) *Service { return &Service{repo: repo} }

func (s *Service) NormalizePart(raw string) (string, error) {
	n := strings.ToUpper(strings.NewReplacer(" ", "", ".", "", "-", "").Replace(raw))
	if n == "" {
		return "", ErrInvalidPart
	}
	for _, c := range n {
		if (c < 'A' || c > 'Z') && (c < '0' || c > '9') {
			return "", ErrInvalidPart
		}
	}
	return n, nil
}

func (s *Service) ValidateVIN(raw string) (string, error) {
	vin := strings.ToUpper(strings.TrimSpace(raw))
	if len(vin) != 17 {
		return "", ErrInvalidVIN
	}
	for _, c := range vin {
		switch {
		case c >= '0' && c <= '9':
		case c >= 'A' && c <= 'Z' && c != 'I' && c != 'O' && c != 'Q':
		default:
			return "", ErrInvalidVIN
		}
	}
	return vin, nil
}

// ResolveSupersession returns the newest number and the chain walked, starting with number.
func (s *Service) ResolveSupersession(ctx context.Context, number string) (string, []string, error) {
	chain := []string{number}
	for range maxSupersessionHops {
		if err := ctx.Err(); err != nil {
			return "", nil, err
		}
		p, ok := s.repo.FindPart(ctx, number)
		if !ok || p.SupersededBy == "" {
			break
		}
		number = p.SupersededBy
		chain = append(chain, number)
	}
	return number, chain, nil
}

func (s *Service) Check(ctx context.Context, params CheckParams) (Result, error) {
	part, err := s.NormalizePart(params.Part)
	if err != nil {
		return Result{}, err
	}
	vin, err := s.ValidateVIN(params.VIN)
	if err != nil {
		return Result{}, err
	}
	vehicle, err := s.repo.FindVehicle(ctx, vin)
	if err != nil {
		return Result{}, err
	}

	newest, chain, err := s.ResolveSupersession(ctx, part)
	if err != nil {
		return Result{}, err
	}

	res := Result{
		Vehicle:  vehicle,
		Part:     PartRef{Number: part},
		Resolved: Resolved{Number: newest, Chain: chain},
		Status:   StatusNoFit,
		Listings: []Listing{},
	}
	if first, ok := s.repo.FindPart(ctx, part); ok {
		res.Part.Name = first.Name
	}
	resolved, ok := s.repo.FindPart(ctx, newest)
	if !ok {
		return res, nil
	}
	res.Resolved.Name = resolved.Name
	if resolved.Chassis != vehicle.Chassis {
		return res, nil
	}

	res.Status = StatusFits
	if len(chain) > 1 {
		res.Status = StatusSuperseded
	}
	res.Listings = slices.Clone(s.repo.ListListings(ctx, newest))
	slices.SortStableFunc(res.Listings, func(a, b Listing) int { return cmp.Compare(a.PriceAED, b.PriceAED) })
	if res.Listings == nil {
		res.Listings = []Listing{}
	}
	return res, nil
}

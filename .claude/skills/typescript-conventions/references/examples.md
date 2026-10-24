# TypeScript conventions: worked examples

Longer before/after pairs for the rules in SKILL.md that are easiest to get wrong.
Load the section you need.

## Contents

- [Lookup map instead of find-in-map](#lookup-map-instead-of-find-in-map)
- [Timezone handling](#timezone-handling)
- [Debounced search](#debounced-search)
- [Spread with defaults](#spread-with-defaults)
- [Untangling an object literal](#untangling-an-object-literal)
- [Repeated conditional returns](#repeated-conditional-returns)
- [Preserving the return shape on refactor](#preserving-the-return-shape-on-refactor)
- [useEffect misuse](#useeffect-misuse)
- [Forms: reset over repeated setValue](#forms-reset-over-repeated-setvalue)
- [Exhaustive switch over a union](#exhaustive-switch-over-a-union)
- [satisfies instead of a cast](#satisfies-instead-of-a-cast)

## Lookup map instead of find-in-map

```ts
// BAD: O(n²): find runs once per user
const result = users.map(u => {
  const role = roles.find(r => r.id === u.roleId);
  return { ...u, roleName: role?.name };
});

// BAD: still O(n²): the spread copies the accumulator on every step
const roleMap = roles.reduce((acc, r) => ({ ...acc, [r.id]: r }), {});

// GOOD: O(n)
const roleById = new Map(roles.map(r => [r.id, r]));
const result = users.map(u => ({ ...u, roleName: roleById.get(u.roleId)?.name }));
```

Same shape for database access: fetch the batch once, index it, merge in memory.

```ts
// BAD: one query per user
for (const user of users) {
  const profile = await prisma.profile.findUnique({ where: { userId: user.id } });
}

// GOOD: one query, then a map
const profiles = await prisma.profile.findMany({ where: { userId: { in: users.map(u => u.id) } } });
const profileByUser = new Map(profiles.map(p => [p.userId, p]));
```

## Timezone handling

```ts
// BAD: only correct for WIB; every other user sees the wrong time
export function formatDatetime(input: string | Date, addHours = 7, tz = "Asia/Jakarta") {
  return moment.tz(input, tz).add(addHours, "hours").format("DD MMMM YYYY, HH:mm");
}

// GOOD: backend sends UTC ISO 8601, the library converts to the viewer's zone
export function formatDatetime(
  input: string | Date,
  format = "DD MMMM YYYY, HH:mm",
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  return moment.tz(input, timeZone).format(format);
}
```

## Debounced search

```ts
// BAD: every keystroke is a request, and responses can arrive out of order
const [search, setSearch] = useState("");
const { data } = useQuery({ queryKey: ["search", search], queryFn: () => searchApi(search) });

// GOOD: request after the user pauses, the key reflects the debounced value
const [search, setSearch] = useState("");
const debouncedSearch = useDebounce(search, 300);
const { data } = useQuery({
  queryKey: ["search", debouncedSearch],
  queryFn: () => searchApi(debouncedSearch),
  enabled: debouncedSearch.length > 0,
});
```

## Spread with defaults

```ts
// BAD: repetitive, and the defaults are scattered
extraData.filePath = config.s3?.filePath;
extraData.fileType = config.s3?.fileType ?? "";
extraData.delimiter = config.s3?.delimiter;
extraData.header = config.s3?.header ?? "";

// GOOD: defaults first so real values override them
const s3Defaults = { fileType: "", header: "" };
extraData = { ...extraData, ...s3Defaults, ...config.s3 };

// GOOD: or destructure with defaults
const { filePath, fileType = "", delimiter, header = "" } = config.s3 ?? {};
```

## Untangling an object literal

```ts
// BAD: nested ternaries inside conditional spreads, nobody can debug this
await prisma.dataset.update({
  data: {
    extra: {
      ...(request.retention
        ? {
            retention: {
              duration:
                typeof request.retention === "string"
                  ? JSON.parse(request.retention).duration
                  : (request.retention as any).duration,
            },
          }
        : {}),
    },
  },
});

// GOOD: normalise input first, then build the object in named steps
const retention = parseRetention(request.retention);
const dagMeta = buildDagMeta(dagParams);

const extra: DatasetExtra = {
  connType: "csv",
  dagMeta,
  ...(retention && { retention }),
};

await prisma.dataset.update({ data: { extra } });
```

Conditional spread forms, cleanest first:

```ts
...(value && { key: value })              // include when truthy
...(value !== undefined && { key: value }) // include when set, even if 0 / false / ""
```

## Repeated conditional returns

```ts
// BAD: the same `isEmpty ? null : x` pattern fifteen times
return {
  nullCheck: isDataEmpty(nullCheckData) ? null : nullCheckData,
  nullCheckExpectation: isDataEmpty(nullCheckData) ? null : nullCheckExpectation,
  rowCount: isDataEmpty(rowCountData) ? null : rowCountMetrics.value,
  // ...
};

// GOOD: one helper, one builder, then a loop or a few calls
const valueOrNull = <T>(data: unknown, value: T): T | null => (isDataEmpty(data) ? null : value);

const buildMetric = (data: unknown, expectation: unknown, percentage: unknown) => ({
  data: valueOrNull(data, data),
  expectation: valueOrNull(data, expectation),
  percentage: valueOrNull(data, percentage),
});
```

If you are copy-pasting and changing one word each time, you should be looping.

## Preserving the return shape on refactor

```ts
// ORIGINAL
function getUser(id: string): { id: string; name: string; email: string } {
  const user = db.findUser(id);
  return { id: user.id, name: user.name, email: user.email };
}

// GOOD: internals changed, shape preserved, every caller keeps working
function getUser(id: string): { id: string; name: string; email: string } {
  const user = userRepository.findById(id);
  const profile = profileService.enrich(user);
  return { id: profile.id, name: profile.name, email: profile.email };
}

// BAD: shape changed, every caller, test and consumer breaks silently
function getUser(id: string): { user: { id: string; name: string; email: string } } {
  ...
}
```

## useEffect misuse

```ts
// BAD: derived value routed through state and an effect (extra render, stale window)
const [fullName, setFullName] = useState("");
useEffect(() => { setFullName(`${first} ${last}`); }, [first, last]);

// GOOD: just compute it
const fullName = `${first} ${last}`; // useMemo only if it is measurably expensive

// BAD: reacting to a user action via effect
useEffect(() => { if (selected) doSomething(selected); }, [selected]);

// GOOD: do it in the handler that caused it
const handleSelect = (option: Option) => {
  setSelected(option);
  doSomething(option);
};
```

## Forms: reset over repeated setValue

```ts
// BAD: three calls, easy to forget shouldValidate on one of them
form.setValue("name", data.name, { shouldValidate: true });
form.setValue("email", data.email, { shouldValidate: true });
form.setValue("phone", data.phone, { shouldValidate: true });

// GOOD: one batched update
form.reset({ name: data.name, email: data.email, phone: data.phone });
```

Type the form prop, never `any`:

```ts
import type { UseFormReturn } from "react-hook-form";
interface Props { form: UseFormReturn<CreateUserValues>; }
```

## Exhaustive switch over a union

```ts
type OrderStatus = "pending" | "paid" | "shipped" | "cancelled";

// BAD: a new status ("refunded") falls through silently and renders nothing
function statusLabel(status: OrderStatus): string {
  switch (status) {
    case "pending":
      return "Waiting for payment";
    case "paid":
      return "Paid";
    default:
      return "";
  }
}

// GOOD: adding a member to OrderStatus is a compile error here until it is handled
function statusLabel(status: OrderStatus): string {
  switch (status) {
    case "pending":
      return "Waiting for payment";
    case "paid":
      return "Paid";
    case "shipped":
      return "On the way";
    case "cancelled":
      return "Cancelled";
    default: {
      const unreachable: never = status;
      throw new Error(`Unhandled status: ${unreachable}`);
    }
  }
}
```

A lookup table typed with `satisfies Record<OrderStatus, string>` gives the same guarantee
with less code when every branch is just a value.

## satisfies instead of a cast

```ts
// BAD: the cast hides a typo ("shiped") and widens keys to string
const STATUS_COLOR = {
  pending: "amber",
  paid: "green",
  shiped: "blue",
} as Record<OrderStatus, string>;

// GOOD: every key is checked against OrderStatus, a missing or misspelled key fails
const STATUS_COLOR = {
  pending: "amber",
  paid: "green",
  shipped: "blue",
  cancelled: "gray",
} satisfies Record<OrderStatus, string>;
```
